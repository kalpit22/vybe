import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CarFront, Check, ChevronRight, CircleDollarSign, CircleHelp, Clock3, Landmark, Leaf, LocateFixed, MapPin, MessageSquare, Phone, Plus, Search, Shield, ShieldAlert, Star, UserRound, Wallet, X } from 'lucide-react';
import GoogleRouteMap from './components/GoogleRouteMap';
import { backend, type Contact, type IncomingRequest } from './lib/backend';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { AccountType, DriverEarning, DriverPayout, DriverPayoutAccount, RecurringCommute, Ride, RideRequest, WalletTransaction } from './lib/types';

const defaultFarePerKm = Math.max(1, Number(import.meta.env.VITE_VYBE_RATE_PER_KM) || 12);
const money = (rupees: number) => `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

type Page = 'Discover' | 'My rides' | 'Schedule' | 'Safety' | 'Wallet';
const demoRides: Ride[] = [
  { id:'demo-1', driver_id:'demo-driver-1', origin:'Whitefield, Bengaluru', destination:'Bellandur, Bengaluru', departure_at:new Date(Date.now()+86400000).toISOString(), seats_available:2, vehicle:'Hyundai i20', distance_km:18.4, fare_per_seat:42, women_only:true, community_name:'Bosscoder School', notes:'Quiet ride, AC on', status:'open', profiles:{full_name:'Ananya Rao',avatar_url:null,verified:true,driver_rating_average:4.9,driver_rating_count:26} },
  { id:'demo-2', driver_id:'demo-driver-2', origin:'ITPL Main Gate, Bengaluru', destination:'Bellandur, Bengaluru', departure_at:new Date(Date.now()+90000000).toISOString(), seats_available:3, vehicle:'Tata Nexon EV', distance_km:16.8, fare_per_seat:36, women_only:false, community_name:'Bosscoder School', notes:'Usually takes ORR', status:'open', profiles:{full_name:'Rahul Mehta',avatar_url:null,verified:true,driver_rating_average:4.8,driver_rating_count:14} },
  { id:'demo-3', driver_id:'demo-driver-3', origin:'Hope Farm, Bengaluru', destination:'Ecospace, Bengaluru', departure_at:new Date(Date.now()+93600000).toISOString(), seats_available:1, vehicle:'Honda City', distance_km:20.1, fare_per_seat:48, women_only:true, community_name:'Bosscoder School', notes:null, status:'open', profiles:{full_name:'Ishita Sharma',avatar_url:null,verified:true,driver_rating_average:5,driver_rating_count:9} }
];
const nav: {name:Page; icon:typeof Search}[] = [{name:'Discover',icon:Search},{name:'My rides',icon:CarFront},{name:'Schedule',icon:CalendarDays},{name:'Safety',icon:Shield},{name:'Wallet',icon:Wallet}];
function dateLabel(value: string) { return new Intl.DateTimeFormat('en-IN',{weekday:'short',hour:'numeric',minute:'2-digit'}).format(new Date(value)); }
const weekDays = [{day:1,label:'Mon'},{day:2,label:'Tue'},{day:3,label:'Wed'},{day:4,label:'Thu'},{day:5,label:'Fri'},{day:6,label:'Sat'},{day:0,label:'Sun'}];
const localCommutes = (): RecurringCommute[] => {
  try { return JSON.parse(localStorage.getItem('vybe-commutes') || '[]') as RecurringCommute[]; }
  catch { return []; }
};
function daysForMask(mask: number) { return weekDays.filter(({day}) => (mask & (1 << day)) !== 0).map(({label}) => label).join(', '); }
function loadRazorpayCheckout() {
  if(window.Razorpay)return Promise.resolve();
  return new Promise<void>((resolve,reject)=>{
    const existing=document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    const script=existing||document.createElement('script');
    script.src='https://checkout.razorpay.com/v1/checkout.js';
    script.dataset.razorpayCheckout='true';
    script.onload=()=>resolve();
    script.onerror=()=>reject(new Error('Could not load Razorpay Checkout. Check your internet connection and retry.'));
    if(!existing)document.head.appendChild(script);
  });
}

export default function App() {
  const [page,setPage]=useState<Page>('Discover'), [rides,setRides]=useState<Ride[]>(demoRides), [requests,setRequests]=useState<RideRequest[]>([]), [incomingRequests,setIncomingRequests]=useState<IncomingRequest[]>([]);
  const [commutes,setCommutes]=useState<RecurringCommute[]>(()=>supabase?[]:localCommutes()), [walletTransactions,setWalletTransactions]=useState<WalletTransaction[]>([]);
  const [driverEarnings,setDriverEarnings]=useState<DriverEarning[]>([]), [driverPayouts,setDriverPayouts]=useState<DriverPayout[]>([]), [payoutAccount,setPayoutAccount]=useState<DriverPayoutAccount|null>(null);
  const [commuteOrigin,setCommuteOrigin]=useState(''), [commuteDestination,setCommuteDestination]=useState(''), [commuteTime,setCommuteTime]=useState('08:00'), [commuteWeekdays,setCommuteWeekdays]=useState<number[]>([1,2,3,4,5]);
  const [from,setFrom]=useState('Whitefield, Bengaluru'), [to,setTo]=useState('Bellandur, Bengaluru'), [womenOnly,setWomenOnly]=useState(false), [sameGroup,setSameGroup]=useState(true);
  const [toast,setToast]=useState(''), [busy,setBusy]=useState(false), [userName,setUserName]=useState('Guest'), [userEmail,setUserEmail]=useState(''), [verified,setVerified]=useState(false), [authOpen,setAuthOpen]=useState(false), [authMode,setAuthMode]=useState<'sign-in'|'sign-up'|'reset'|'update-password'>('sign-in'), [offerOpen,setOfferOpen]=useState(false), [selected,setSelected]=useState<Ride|null>(null), [reportOpen,setReportOpen]=useState(false);
  const [accountType,setAccountType]=useState<AccountType>('both');
  const [sosOpen,setSosOpen]=useState(false), [sosContactId,setSosContactId]=useState(''), [sosLocation,setSosLocation]=useState<{latitude:number;longitude:number}|null>(null), [sosLocationError,setSosLocationError]=useState(''), [sosLocationBusy,setSosLocationBusy]=useState(false);
  const [offer,setOffer]=useState({origin:'',destination:'',when:'',seats:3,vehicle:'',fare:40,rate:defaultFarePerKm,women:false});
  const [offerRouteDistanceKm,setOfferRouteDistanceKm]=useState<number|null>(null), [offerRouteRequestId,setOfferRouteRequestId]=useState(0);
  const [payoutSetupOpen,setPayoutSetupOpen]=useState(false), [payoutMethod,setPayoutMethod]=useState<'upi'|'bank_account'>('upi');
  const [ratingTarget,setRatingTarget]=useState<RideRequest|null>(null), [driverRating,setDriverRating]=useState(5), [driverReviewComment,setDriverReviewComment]=useState('');
  const [contact,setContact]=useState(''), [contactName,setContactName]=useState(''), [contacts,setContacts]=useState<Contact[]>(()=>JSON.parse(localStorage.getItem('vybe-contacts')||'[]'));
  const [reportCategory,setReportCategory]=useState('safety_concern'), [reportDetails,setReportDetails]=useState('');
  const [searchDone,setSearchDone]=useState(false), [routeRequestId,setRouteRequestId]=useState(0);
  const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(''),2800);};
  const refresh=async()=>{
    if(!supabase) return;
    const {data:auth}=await backend.auth.getUser();
    if(!auth.user){setUserEmail('');setUserName('Guest');setVerified(false);setAccountType('both');setRequests([]);setIncomingRequests([]);setContacts([]);setCommutes([]);setWalletTransactions([]);setDriverEarnings([]);setDriverPayouts([]);setPayoutAccount(null);setRides([]);return;}
    setUserEmail(auth.user.email||'');setUserName(auth.user.user_metadata.full_name||auth.user.email?.split('@')[0]||'Commuter');
    const {data:profile}=await backend.profiles.get(auth.user.id);
    setVerified(Boolean(profile?.verified));
    setAccountType(profile?.account_type==='rider'||profile?.account_type==='driver'?profile.account_type:'both');
    if(profile?.full_name)setUserName(profile.full_name);
    const {data:rideData,error}=await backend.rides.listOpen();
    if(error) { notify(`Could not load Supabase rides: ${error.message}`); return; }
    setRides((rideData||[]) as Ride[]);
    const [{data:req},{data:contactRows},{data:myRideRows},{data:commuteRows,error:commuteError},{data:walletRows,error:walletError},{data:payoutAccountRow,error:payoutAccountError},{data:earningRows,error:earningsError},{data:payoutRows,error:payoutHistoryError}]=await Promise.all([
      backend.rideRequests.listForRider(auth.user.id),
      backend.contacts.listForUser(auth.user.id),
      backend.rides.listIdsForDriver(auth.user.id),
      backend.commutes.listForUser(auth.user.id),
      backend.wallet.listTransactions(auth.user.id),
      backend.driverPayouts.account(auth.user.id),
      backend.driverPayouts.earnings(),
      backend.driverPayouts.history(auth.user.id)
    ]);
    setRequests((req||[]) as unknown as RideRequest[]); setContacts((contactRows||[]) as Contact[]);
    setCommutes((commuteRows||[]) as RecurringCommute[]); setWalletTransactions((walletRows||[]) as WalletTransaction[]);
    setPayoutAccount(payoutAccountRow as DriverPayoutAccount|null);
    setDriverEarnings((earningRows||[]) as DriverEarning[]); setDriverPayouts((payoutRows||[]) as DriverPayout[]);
    if(commuteError||walletError)notify('Run Supabase migration 202610100004_connect_schedule_wallet.sql to connect Schedule and Wallet.');
    if(payoutAccountError||earningsError||payoutHistoryError)notify('Run Supabase migration 202610100005_driver_map_fares_payouts.sql to connect driver earnings and payouts.');
    if(myRideRows?.length){const {data:incoming}=await backend.rideRequests.listForRides(myRideRows.map(r=>r.id));setIncomingRequests((incoming||[]) as unknown as IncomingRequest[]);}else setIncomingRequests([]);
  };
  useEffect(()=>{void refresh(); if(supabase){const {data:{subscription}}=backend.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){setAuthMode('update-password');setAuthOpen(true);}window.setTimeout(()=>void refresh(),0);});return()=>subscription.unsubscribe();}},[]);
  useEffect(()=>{
    const handleAuthCallback=(event:Event)=>{
      if(!supabase)return;
      const callbackUrl=(event as CustomEvent<string>).detail;
      const code=new URL(callbackUrl).searchParams.get('code');
      if(!code){notify('The sign-in link did not include a verification code. Please try signing in again.');return;}
      void backend.auth.exchangeCodeForSession(code).then(({data,error})=>{
        if(error)notify(error.message);else if(data.session){notify('Email confirmed. You are signed in.');void refresh();}
      });
    };
    window.addEventListener('vybe:auth-callback',handleAuthCallback);
    return()=>window.removeEventListener('vybe:auth-callback',handleAuthCallback);
  },[]);
  const coinBalance=useMemo(()=>walletTransactions.reduce((sum,entry)=>sum+entry.coin_delta,0),[walletTransactions]);
  const matches=useMemo(()=>rides.filter(r=>r.status==='open'&&r.seats_available>0&&(!womenOnly||r.women_only)&&(!sameGroup||!r.community_name||r.community_name==='Bosscoder School')&&(r.origin.toLowerCase().includes(from.split(',')[0].trim().toLowerCase())||!searchDone)&&(r.destination.toLowerCase().includes(to.split(',')[0].trim().toLowerCase())||!searchDone)),[rides,womenOnly,sameGroup,from,to,searchDone]);
  const payoutEligible=(earning:DriverEarning)=>!earning.payout_status||['failed','reversed','rejected','cancelled'].includes(earning.payout_status);
  const availablePayoutPaise=driverEarnings.filter(payoutEligible).reduce((sum,earning)=>sum+earning.amount_paise,0);
  const book=async(ride:Ride)=>{
    if(!supabase){notify('Demo request saved locally for this session. Connect Supabase to send a real request.');setRequests(v=>[{id:`local-${Date.now()}`,ride_id:ride.id,status:'pending',rides:ride},...v]);return;}
    const {data:{user}}=await backend.auth.getUser(); if(!user){setAuthMode('sign-in');setAuthOpen(true);notify('Sign in to request a seat.');return;}
    if(!verified){notify('Identity verification is required before requesting a real ride.');return;}
    setBusy(true);const {error}=await backend.rideRequests.create(ride.id,user.id);setBusy(false);
    if(error)notify(error.message);else{notify('Seat request sent.');void refresh();}
  };
  const updateOfferRoute=(route:{distanceKm:number|null;durationMinutes:number|null}|null)=>{
    if(!route?.distanceKm){setOfferRouteDistanceKm(null);return;}
    const distanceKm=Math.round(route.distanceKm*100)/100;
    setOfferRouteDistanceKm(distanceKm);
    setOffer(current=>({...current,fare:Math.max(1,Math.round(distanceKm*current.rate))}));
  };
  const publish=async(e:React.FormEvent)=>{e.preventDefault();if(!offer.origin||!offer.destination||!offer.when){notify('Add your route and departure time.');return;}
    if(!Number.isFinite(Number(offer.fare))||Number(offer.fare)<1){notify('Set a fare of at least ₹1 per seat.');return;}
    if(!supabase){const mock:Ride={id:`local-${Date.now()}`,driver_id:'local',origin:offer.origin,destination:offer.destination,departure_at:new Date(offer.when).toISOString(),seats_available:Number(offer.seats),vehicle:offer.vehicle||'Vehicle details to come',fare_per_seat:Number(offer.fare),distance_km:offerRouteDistanceKm,women_only:offer.women,community_name:'Bosscoder School',notes:null,status:'open',profiles:{full_name:userName,avatar_url:null,verified:false}};setRides(v=>[mock,...v]);setOfferOpen(false);notify('Demo ride added. Connect Supabase to publish it online.');return;}
    const {data:{user}}=await backend.auth.getUser();if(!user){setAuthMode('sign-in');setAuthOpen(true);notify('Sign in to offer a ride.');return;}
    if(accountType==='rider'){notify('Switch your account type to Driver or Both to offer a ride.');return;}
    if(!verified){notify('Driver verification is required before publishing a real ride.');return;}
    setBusy(true);const {error}=await backend.rides.create({driver_id:user.id,origin:offer.origin,destination:offer.destination,departure_at:new Date(offer.when).toISOString(),seats_available:Number(offer.seats),vehicle:offer.vehicle,fare_per_seat:Number(offer.fare),distance_km:offerRouteDistanceKm,women_only:offer.women,community_name:null});setBusy(false);
    if(error)notify(error.message);else{setOfferOpen(false);notify('Your ride is live.');void refresh();}
  };
  const authenticate=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(!supabase){notify('Add your Supabase URL and publishable key to enable accounts.');return;}
    const data=new FormData(e.currentTarget),email=String(data.get('email')||''),password=String(data.get('password')||''),name=String(data.get('name')||'').trim(),signupType=String(data.get('account_type')||accountType) as AccountType;
    const redirectTo=window.VybeAndroid?.isNativeApp()?'vybe://auth/callback':window.location.origin;
    setBusy(true);
    if(authMode==='reset'){
      const {error}=await backend.auth.sendPasswordReset(email,redirectTo);setBusy(false);
      if(error)notify(error.message);else{setAuthOpen(false);setAuthMode('sign-in');notify('Password reset link sent. Check your email.');}
      return;
    }
    if(authMode==='update-password'){
      const confirmation=String(data.get('confirmPassword')||'');
      if(password.length<8||password!==confirmation){setBusy(false);notify('Use at least 8 characters and make both passwords match.');return;}
      const {error}=await backend.auth.updatePassword(password);setBusy(false);
      if(error)notify(error.message);else{setAuthOpen(false);setAuthMode('sign-in');notify('Password updated. You are signed in.');void refresh();}
      return;
    }
    if(authMode==='sign-up'&&(password.length<8||!name)){setBusy(false);notify('Add your name and choose a password with at least 8 characters.');return;}
    const result=authMode==='sign-up'
      ? await backend.auth.signUp(email,password,name,signupType,redirectTo)
      : await backend.auth.signIn(email,password);
    setBusy(false);
    if(result.error)notify(result.error.message);
    else{setAuthOpen(false);setAuthMode('sign-in');notify(authMode==='sign-up'&&!result.data.session?'Check your email to confirm your account.':authMode==='sign-up'?'Account created.':'Signed in.');void refresh();}
  };
  const changeAccountType=async(next:AccountType)=>{
    setAccountType(next);
    if(!userEmail||!supabase){notify('Sign in or create an account to save this role.');return;}
    setBusy(true);const {data:{user},error:authError}=await backend.auth.getUser();
    if(authError||!user){setBusy(false);notify('Sign in again to save this account type.');return;}
    const {error}=await backend.profiles.setAccountType(user.id,next);setBusy(false);
    if(error){notify(`Could not update account type: ${error.message}`);void refresh();}
    else notify(next==='rider'?'Rider mode saved. You can still request seats.':next==='driver'?'Driver mode saved. You can also request seats.':'Both rider and driver modes saved.');
  };
  const saveCommute=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    const origin=commuteOrigin.trim(),destination=commuteDestination.trim();
    if(!origin||!destination||commuteWeekdays.length===0){notify('Add both locations and choose at least one weekday.');return;}
    const weekday_mask=commuteWeekdays.reduce((mask,day)=>mask|(1<<day),0);
    if(!supabase){
      const next:RecurringCommute={id:`local-${Date.now()}`,user_id:'local',origin,destination,departure_time:commuteTime,weekday_mask,active:true,created_at:new Date().toISOString()};
      setCommutes(value=>{const updated=[next,...value];localStorage.setItem('vybe-commutes',JSON.stringify(updated));return updated;});
      notify('Commute saved on this device.');return;
    }
    const {data:{user}}=await backend.auth.getUser();
    if(!user){setAuthMode('sign-in');setAuthOpen(true);notify('Sign in to save a commute to Supabase.');return;}
    setBusy(true);
    const {data,error}=await backend.commutes.create({user_id:user.id,origin,destination,departure_time:commuteTime,weekday_mask,active:true});
    setBusy(false);
    if(error)notify(error.message);else if(data){setCommutes(value=>[data as RecurringCommute,...value]);notify('Recurring commute saved to Supabase.');}
  };
  const removeCommute=async(commute:RecurringCommute)=>{
    if(supabase&&!commute.id.startsWith('local-')){
      setBusy(true);const {error}=await backend.commutes.remove(commute.id);setBusy(false);
      if(error){notify(error.message);return;}
    }
    setCommutes(value=>{const updated=value.filter(item=>item.id!==commute.id);if(!supabase)localStorage.setItem('vybe-commutes',JSON.stringify(updated));return updated;});
    notify('Commute removed.');
  };
  const verifyRazorpayPayment=async(response:RazorpayPaymentResponse)=>{
    if(!supabase){notify('Supabase is needed to verify this payment.');return;}
    setBusy(true);
    const {data,error}=await backend.payments.verify(response);
    setBusy(false);
    if(error)notify(error.message||'Payment verification is still pending. Refresh My rides shortly.');
    else if(data?.status==='paid'){notify('Payment confirmed. Your ride request is paid.');void refresh();}
    else notify('Payment is processing. Check My rides again shortly.');
  };
  useEffect(()=>{
    const handleSuccess=(event:Event)=>void verifyRazorpayPayment((event as CustomEvent<RazorpayPaymentResponse>).detail);
    const handleFailure=(event:Event)=>notify((event as CustomEvent<string>).detail||'Payment was cancelled or could not be completed.');
    window.addEventListener('vybe:razorpay-success',handleSuccess);
    window.addEventListener('vybe:razorpay-failure',handleFailure);
    return()=>{window.removeEventListener('vybe:razorpay-success',handleSuccess);window.removeEventListener('vybe:razorpay-failure',handleFailure);};
  },[verifyRazorpayPayment]);
  const payForRequest=async(request:RideRequest)=>{
    if(!supabase){notify('Connect Supabase and deploy the payment functions to enable checkout.');return;}
    if(request.status!=='accepted'){notify('The driver must accept your seat request before payment.');return;}
    const {data:{user}}=await backend.auth.getUser();
    if(!user){setAuthMode('sign-in');setAuthOpen(true);notify('Sign in to continue to payment.');return;}
    setBusy(true);
    const {data:order,error}=await backend.payments.createOrder(request.id);
    if(error||!order){setBusy(false);notify(error?.message||'Could not start checkout. Check Supabase Edge Function setup.');return;}
    const description=`${request.rides?.origin||'Ride'} → ${request.rides?.destination||'Vybe ride'}`;
    const options={key:order.key_id,amount:order.amount,currency:order.currency,name:'Vybe',description,order_id:order.order_id,prefill:{name:userName,email:userEmail},theme:{color:'#246d52'}};
    try{
      if(window.VybeAndroid?.isNativeApp()){
        if(!window.VybeAndroid.openRazorpayCheckout(JSON.stringify(options)))throw new Error('Could not open Razorpay checkout in Vybe.');
      }else{
        await loadRazorpayCheckout();
        if(!window.Razorpay)throw new Error('Razorpay Checkout did not load.');
        const checkout=new window.Razorpay({...options,handler:response=>void verifyRazorpayPayment(response),modal:{ondismiss:()=>notify('Checkout closed. You can retry from My rides.')}});
        checkout.on('payment.failed',response=>notify(response.error?.description||'Payment failed. You can retry from My rides.'));
        checkout.open();
      }
    }catch(error){notify(error instanceof Error?error.message:'Could not open payment checkout.');}
    setBusy(false);
  };
  const respondToRequest=async(requestId:string,status:'accepted'|'declined')=>{
    if(!supabase)return;
    setBusy(true);const {data,error}=await backend.rideRequests.updatePendingStatus(requestId,status);setBusy(false);
    if(error)notify(error.message);else if(!data)notify('This request has already been updated.');else{notify(status==='accepted'?'Seat request accepted. The rider can now pay.':'Seat request declined.');void refresh();}
  };
  const confirmCompletion=async(requestId:string)=>{
    if(!supabase){notify('Connect Supabase to confirm and settle a ride.');return;}
    setBusy(true);const {data,error}=await backend.rideRequests.confirmCompletion(requestId);setBusy(false);
    if(error)notify(error.message);else if(data==='completed')notify('Ride completion confirmed by both sides. Driver earnings are now eligible for payout.');else notify('Your confirmation is saved. Waiting for the other person to confirm the ride.');
    void refresh();
  };
  const requestPayout=async(earning:DriverEarning)=>{
    if(!supabase){notify('Connect Supabase and configure RazorpayX to send a real driver payout.');return;}
    if(!payoutAccount){setPayoutSetupOpen(true);notify('Add a UPI or bank account to receive driver payouts.');return;}
    setBusy(true);const {data,error}=await backend.driverPayouts.request(earning.ride_request_id);setBusy(false);
    if(error)notify(error.message||'Could not request this payout.');
    else notify(`Payout status: ${String(data?.status||'processing')}.`);
    void refresh();
  };
  const savePayoutAccount=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!supabase){notify('Connect Supabase before adding a payout destination.');return;}
    const form=new FormData(event.currentTarget);
    const payload={name:String(form.get('name')||'').trim(),phone:String(form.get('phone')||'').trim(),payout_method:payoutMethod,...(payoutMethod==='upi'?{vpa:String(form.get('vpa')||'').trim()}:{account_number:String(form.get('account_number')||'').trim(),ifsc:String(form.get('ifsc')||'').trim()})};
    setBusy(true);const {data,error}=await backend.driverPayouts.saveAccount(payload);setBusy(false);
    if(error)notify(error.message||'Could not save the payout destination.');
    else{setPayoutSetupOpen(false);notify(data?.message||'Payout account saved securely with RazorpayX.');void refresh();}
  };
  const submitDriverReview=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!supabase||!ratingTarget?.rides){notify('Sign in to save a driver rating.');return;}
    const {data:{user}}=await backend.auth.getUser();
    if(!user){notify('Sign in to rate this driver.');return;}
    setBusy(true);const {error}=await backend.reviews.create({ride_request_id:ratingTarget.id,ride_id:ratingTarget.ride_id,rider_id:user.id,driver_id:ratingTarget.rides.driver_id,rating:driverRating,comment:driverReviewComment.trim()||null});setBusy(false);
    if(error)notify(error.code==='23505'?'You already rated this ride.':error.message);
    else{setRatingTarget(null);setDriverReviewComment('');notify('Driver rating saved. Thank you.');void refresh();}
  };
  const addContact=async()=>{const value=contact.trim(),name=contactName.trim();if(!value||!name){notify('Enter a contact name and phone number or email.');return;}const isEmail=value.includes('@');
    if(!supabase){const next=[...contacts,{id:`local-${Date.now()}`,name,phone:isEmail?null:value,email:isEmail?value:null}];setContacts(next);localStorage.setItem('vybe-contacts',JSON.stringify(next));setContact('');setContactName('');notify('Demo contact saved on this device.');return;}
    const {data:{user}}=await backend.auth.getUser();if(!user){setAuthMode('sign-in');setAuthOpen(true);notify('Sign in to save trusted contacts to Supabase.');return;}
    setBusy(true);const {data,error}=await backend.contacts.create(user.id,name,isEmail?null:value,isEmail?value:null);setBusy(false);
    if(error)notify(error.message);else{setContacts(v=>[...v,data as Contact]);setContact('');setContactName('');notify('Trusted contact saved to Supabase.');}
  };
  const removeContact=async(id:string)=>{if(supabase&&!id.startsWith('local-')){const {error}=await backend.contacts.remove(id);if(error){notify(error.message);return;}}const next=contacts.filter(c=>c.id!==id);setContacts(next);if(!supabase)localStorage.setItem('vybe-contacts',JSON.stringify(next));};
  const phoneContacts=contacts.filter(c=>c.phone?.trim());
  const sosContact=phoneContacts.find(c=>c.id===sosContactId)||phoneContacts[0];
  const sosMessage=`I need help. Please contact me as soon as possible.${sosLocation?` My current location: https://maps.google.com/?q=${sosLocation.latitude.toFixed(6)},${sosLocation.longitude.toFixed(6)}`:''}`;
  const prepareSosLocation=()=>{
    setSosLocationError('');
    if(!navigator.geolocation){setSosLocationError('Location is not available in this browser. You can still send an alert without it.');return;}
    setSosLocationBusy(true);
    navigator.geolocation.getCurrentPosition(position=>{
      setSosLocation({latitude:position.coords.latitude,longitude:position.coords.longitude});
      setSosLocationBusy(false);
      setSosLocationError('');
    },error=>{
      setSosLocationBusy(false);
      setSosLocationError(error.code===1?'Location permission was not granted. You can still send an alert without it.':'Could not get your location. You can still send an alert without it.');
    },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  };
  const openSosSms=()=>{
    if(!sosContact?.phone){notify('Add a trusted contact with a phone number to send an SOS text.');return;}
    if(window.VybeAndroid?.isNativeApp()){if(!window.VybeAndroid.openSmsComposer(sosContact.phone,sosMessage))notify('Could not open the SMS app. Check the trusted contact phone number.');}
    else window.location.href=`sms:${encodeURIComponent(sosContact.phone)}?body=${encodeURIComponent(sosMessage)}`;
  };
  const callEmergencyServices=()=>{
    if(window.VybeAndroid?.isNativeApp())window.VybeAndroid.openEmergencyDialer('112');
    else window.location.href='tel:112';
  };
  const copySosMessage=async()=>{
    try{await navigator.clipboard.writeText(sosMessage);notify('SOS message copied. Share it with someone you trust.');}
    catch{notify('Copy is unavailable here. Select and copy the message preview.');}
  };
  const submitReport=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;if(!supabase){notify('Reports need a configured Supabase project.');setReportOpen(false);return;}const {data:{user}}=await backend.auth.getUser();if(!user){setReportOpen(false);setAuthMode('sign-in');setAuthOpen(true);notify('Sign in to send a report.');return;}
    setBusy(true);const {error}=await backend.reports.create({reporter_id:user.id,reported_user_id:selected.driver_id,ride_id:selected.id,category:reportCategory,details:reportDetails.trim()||null});setBusy(false);
    if(error)notify(error.message);else{notify('Report sent to the Vybe safety queue.');setReportDetails('');setReportOpen(false);setSelected(null);}
  };
  const logOut=async()=>{if(supabase)await backend.auth.signOut();setUserName('Guest');setUserEmail('');setVerified(false);setAccountType('both');setRequests([]);setContacts([]);notify('Signed out.');};
  return <div className="app-shell"><aside className="sidebar"><button className="brand" aria-label="Vybe home" onClick={()=>setPage('Discover')}><img className="brand-logo" src="/vybe-logo.jpeg" alt="Vybe — share the ride, catch the vibe."/></button><p className="eyebrow nav-title">YOUR COMMUTE</p>{nav.map(({name,icon:Icon})=><button key={name} className={`nav-link ${page===name?'active':''}`} onClick={()=>setPage(name)}><Icon size={18}/>{name}{name==='Safety'&&<i/>}</button>)}
    <div className="community"><p className="eyebrow">YOUR COMMUNITY</p><div className="community-row"><span className="community-badge">BST</span><span><b>Bosscoder School</b><small>Demo community</small></span></div></div><div className="impact"><div><Leaf size={15}/> YOUR IMPACT</div><strong>12.4 <small>kg CO₂</small></strong><span>Estimated emissions saved</span><div className="progress"><i/></div></div><button className="profile" onClick={()=>userEmail?void logOut():(setAuthMode('sign-in'),setAuthOpen(true))}><span className="avatar">{userName.slice(0,1).toUpperCase()}</span><span><b>{userName}</b><small>{userEmail||'Demo commuter'} · {userEmail?'Sign out':'Sign in'}</small></span><ChevronRight size={16}/></button>
  </aside><main className="main"><header className="topbar"><div className="crumb">Home <span>/</span> <b>{page}</b></div><div className="top-actions"><span className={`mode-pill ${isSupabaseConfigured?'live':''}`}><i/>{isSupabaseConfigured?'SUPABASE CONNECTED':'DEMO MODE'}</span><label className="role-select-wrap"><UserRound size={14}/><select className="role-select" aria-label="Account type" value={accountType} disabled={busy} onChange={e=>void changeAccountType(e.target.value as AccountType)}><option value="rider">Rider</option><option value="driver">Driver</option><option value="both">Both</option></select></label><button className="icon-button" aria-label="Help" onClick={()=>notify('Demo data is illustrative. Complete Supabase setup to enable live accounts and rides.')}><CircleHelp size={18}/></button><button className="user-pill" onClick={()=>userEmail?void logOut():(setAuthMode('sign-in'),setAuthOpen(true))}><span className="avatar small">{userName.slice(0,1).toUpperCase()}</span>{userName}<ChevronRight size={14}/></button></div></header>
    <div className="content"><div className="hero-heading"><div><span className="tag">● YOUR DAILY COMMUTE, REIMAGINED</span><h1>Good morning, {userName} ☀️</h1><p>A better commute starts with people going your way. Find your people, split the cost, and make every ride count.</p></div>{accountType!=='rider'&&<button className="button secondary" onClick={()=>{setOffer({origin:'',destination:'',when:'',seats:3,vehicle:'',fare:40,rate:defaultFarePerKm,women:false});setOfferRouteDistanceKm(null);setOfferRouteRequestId(0);setOfferOpen(true);}}><Plus size={17}/> Offer a ride</button>}</div>
    {page==='Discover'&&<>{isSupabaseConfigured&&!userEmail&&<div className="note live-sign-in"><span>Sign in to browse live rides from Supabase.</span><button className="text-button" onClick={()=>{setAuthMode('sign-in');setAuthOpen(true);}}>Sign in</button></div>}<section className="search-panel"><div className="panel-copy"><small>FIND YOUR RIDE</small><h2>Your route.<br/>Your rhythm.</h2><p>Match on real route overlap, not just distance.</p><span><Shield size={15}/> Verified commuters only</span></div><div className="search-form"><label>From<input value={from} onChange={e=>setFrom(e.target.value)} placeholder="Pickup area"/></label><label>Going to<input value={to} onChange={e=>setTo(e.target.value)} placeholder="Destination"/></label><label>Departure<select defaultValue="morning"><option value="morning">Tomorrow morning</option><option>Today evening</option><option>Weekdays</option></select></label><button className="button light-button" onClick={()=>{setSearchDone(true);setRouteRequestId(value=>value+1);}}><Search size={17}/> Find rides</button></div></section><GoogleRouteMap origin={from} destination={to} requestId={routeRequestId}/>
      <div className="list-heading"><div><h2>Rides going your way</h2><p>Best matches for {from.split(',')[0]} → {to.split(',')[0]}</p></div><span>{matches.length} matches</span></div><div className="filters"><button className={sameGroup?'filter active-filter':'filter'} onClick={()=>setSameGroup(v=>!v)}><Shield size={14}/> Same community {sameGroup?'✓':'+'}</button><button className={womenOnly?'filter active-filter':'filter'} onClick={()=>setWomenOnly(v=>!v)}>Women-only {womenOnly?'✓':'+'}</button><button className="filter" onClick={()=>notify('Route overlap and fare estimates are demo values until mapping is connected.')}>♢ Route overlap</button></div>
      <div className="ride-list">{matches.map((ride,index)=><article className="ride-card" key={ride.id}><div className="ride-person"><span className={`avatar driver-avatar avatar-${index}`}>{ride.profiles?.full_name?.split(' ').map(s=>s[0]).join('')||'V'}</span><span><b>{ride.profiles?.full_name||'Vybe commuter'}</b><small>{ride.profiles?.verified ? <span className="verified"><Check size={12}/> Verified</span> : <span className="unverified">Not yet verified</span>} · {ride.vehicle||'Vehicle details pending'} · {ride.profiles?.driver_rating_count?`${Number(ride.profiles.driver_rating_average||0).toFixed(1)} ★ (${ride.profiles.driver_rating_count})`:'New driver'}</small></span></div><div className="route"><div><MapPin size={15}/><span><small>FROM</small><b>{ride.origin}</b></span></div><div className="route-line"/><div><MapPin size={15}/><span><small>TO</small><b>{ride.destination}</b></span></div></div><div className="ride-meta"><span><Clock3 size={15}/>{dateLabel(ride.departure_at)}</span><span><UserRound size={15}/>{ride.seats_available} seats</span>{ride.distance_km&&<span><MapPin size={14}/>{Number(ride.distance_km).toFixed(1)} km</span>}{ride.women_only&&<span className="women-tag">Women only</span>}</div><div className="ride-price"><small>YOUR SHARE</small><b>{money(ride.fare_per_seat)}</b>{ride.distance_km&&<small className="per-km">{money(ride.fare_per_seat/Number(ride.distance_km))} / km</small>}<button className="button request-button" disabled={busy} onClick={()=>setSelected(ride)}>View ride</button></div></article>)}{matches.length===0&&<div className="empty"><CarFront/><b>No rides match this route yet.</b><span>Try another community setting or offer your own ride.</span></div>}</div></>}
    {page==='My rides'&&<div className="rides-dashboard">{incomingRequests.length>0&&<section className="page-card incoming-card"><h2>Requests for your rides</h2><p className="muted">Accept a request, then confirm the trip after its fare is paid.</p>{incomingRequests.map(r=>{const paid=r.payments?.some(payment=>payment.status==='paid');return <div className="incoming-row" key={r.id}><div><b>{r.rider?.full_name||'Vybe commuter'}</b><span>{r.ride?.origin||'Ride'} → {r.ride?.destination||'Destination'}</span><small>{r.status} · {r.ride?dateLabel(r.ride.departure_at):''}{paid?' · Paid':''}</small></div>{r.status==='pending'?<div className="request-actions"><button className="button" disabled={busy} onClick={()=>void respondToRequest(r.id,'accepted')}>Accept</button><button className="button decline" disabled={busy} onClick={()=>void respondToRequest(r.id,'declined')}>Decline</button></div>:r.status==='accepted'&&paid&&!r.driver_completed_at?<button className="button" disabled={busy} onClick={()=>void confirmCompletion(r.id)}>Confirm trip complete</button>:r.driver_completed_at&&r.status!=='completed'?<span className="status">Waiting for rider</span>:<span className="status">{r.status}</span>}</div>;})}</section>}<section className="page-card"><h2>Your ride requests</h2><p className="muted">Track driver details, payment, trip completion, and ratings.</p>{requests.length?requests.map(r=>{const paid=r.payments?.find(payment=>payment.status==='paid');const fare=r.rides?.fare_per_seat||0;const review=r.driver_reviews?.[0];return <div className="request-row" key={r.id}><div><b>{r.rides?.origin||'Ride request'}</b><span> → {r.rides?.destination||'Destination'}</span><small>{r.status} · {r.rides?dateLabel(r.rides.departure_at):''}</small></div><div className="request-payment">{paid?<div className="request-next-step"><span className="status">Paid · {money(paid.amount_paise/100)}</span>{r.status==='accepted'&&!r.rider_completed_at?<button className="button small-action" disabled={busy} onClick={()=>void confirmCompletion(r.id)}>Confirm trip complete</button>:r.status==='accepted'&&r.rider_completed_at?<span className="status">Waiting for driver</span>:r.status==='completed'&&!review?<button className="button small-action" onClick={()=>{setRatingTarget(r);setDriverRating(5);setDriverReviewComment('');}}>Rate driver</button>:r.status==='completed'?<span className="rating-saved"><Star size={13} fill="currentColor"/> Rated {review?.rating}/5</span>:null}</div>:r.status==='accepted'?<button className="button pay-button" disabled={busy} onClick={()=>void payForRequest(r)}>{busy?'Please wait…':<>Pay {money(fare)}</>}</button>:<span className="status">{r.status}</span>}</div></div>;}) : <div className="empty"><CarFront/><b>Your next commute starts here.</b><span>Request a seat from Discover and it’ll show up here.</span><button className="button" onClick={()=>setPage('Discover')}>Find a ride</button></div>}</section></div>}
    {page==='Schedule'&&<section className="page-card commute-page"><div className="schedule-title"><div className="schedule-icon"><CalendarDays/></div><div><h2>Your weekly commute</h2><p className="muted">Save a repeating route to your account. You can remove it at any time.</p></div></div><form className="commute-form" onSubmit={saveCommute}><div className="form-grid"><label>From<input required value={commuteOrigin} onChange={e=>setCommuteOrigin(e.target.value)} placeholder="Pickup area"/></label><label>Going to<input required value={commuteDestination} onChange={e=>setCommuteDestination(e.target.value)} placeholder="Destination"/></label></div><div className="form-grid commute-time"><label>Departure time<input required type="time" value={commuteTime} onChange={e=>setCommuteTime(e.target.value)}/></label><div><span className="weekday-label">Days</span><div className="weekday-picker">{weekDays.map(({day,label})=><button key={day} type="button" aria-pressed={commuteWeekdays.includes(day)} className={commuteWeekdays.includes(day)?'day-chip selected':'day-chip'} onClick={()=>setCommuteWeekdays(current=>current.includes(day)?current.filter(item=>item!==day):[...current,day])}>{label}</button>)}</div></div></div><button className="button" disabled={busy}>{busy?'Saving…':'Save recurring commute'}</button></form>{isSupabaseConfigured&&!userEmail&&<p className="note">Sign in to save your commute to Supabase.</p>}<div className="saved-commutes">{commutes.length?commutes.map(commute=><article className="saved-commute" key={commute.id}><div><b>{commute.origin} <span>→</span> {commute.destination}</b><small>{daysForMask(commute.weekday_mask)} · {commute.departure_time.slice(0,5)}</small></div><button className="text-button" disabled={busy} onClick={()=>void removeCommute(commute)}>Remove</button></article>):<p className="empty-copy">No recurring commutes saved yet.</p>}</div></section>}
    {page==='Safety'&&<section className="page-card safety-card"><div className="safety-title"><div className="safety-icon"><Shield/></div><div><h2>Your safety, your way</h2><p className="muted">Keep trusted people close and share trip details with them.</p></div></div><div className="safety-row"><div><b>Trusted contacts</b><small>{isSupabaseConfigured?(userEmail?'Saved to your signed-in Supabase account.':'Sign in to load or add Supabase contacts.'):'Stored on this device only in demo mode.'}</small></div><div className="contact-add"><input value={contactName} onChange={e=>setContactName(e.target.value)} placeholder="Contact name"/><input value={contact} onChange={e=>setContact(e.target.value)} placeholder="Phone or email"/><button className="button" disabled={busy} onClick={()=>void addContact()}><Plus size={15}/> Add</button></div></div>{contacts.map(c=><div className="contact-row" key={c.id}><span className="avatar small"><UserRound size={15}/></span><b>{c.name}</b><small className="contact-value">{c.phone||c.email}</small><button className="text-button" onClick={()=>void removeContact(c.id)}>Remove</button></div>)}<div className="sos-card"><div><ShieldAlert/><span><b>Need urgent help?</b><small>Prepare a text for a trusted contact or call emergency services.</small></span></div><button onClick={()=>{setSosContactId(phoneContacts[0]?.id||'');setSosLocation(null);setSosLocationError('');setSosOpen(true);}}>SOS help</button></div></section>}
    {page==='Wallet'&&<div className="wallet-dashboard"><section className="wallet-grid"><div className="wallet-card"><span>VYBE COINS</span><h2>{coinBalance} <small>coins</small></h2><p>Balance calculated from your wallet ledger.</p><div className="wallet-rule">Wallet history is linked to your Supabase account.<small>Coin entries are written only by trusted server-side workflows.</small></div></div><div className="page-card rewards"><h2>Wallet activity</h2><p className="muted">Your account’s recorded coin credits and debits.</p>{walletTransactions.length?walletTransactions.map(entry=><div className="wallet-transaction" key={entry.id}><span><b>{entry.description}</b><small>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(entry.created_at))}</small></span><strong className={entry.coin_delta>0?'coin-credit':'coin-debit'}>{entry.coin_delta>0?'+':''}{entry.coin_delta} coins</strong></div>):<div className="empty"><Wallet/><b>No wallet entries yet.</b><span>When rewards are configured, your real balance and activity will appear here.</span></div>}{isSupabaseConfigured&&!userEmail&&<p className="note">Sign in to load your Supabase wallet.</p>}</div></section><section className="page-card driver-payout-card"><div className="payout-heading"><div><span className="payout-icon"><CircleDollarSign/></span><span><h2>Driver earnings and payouts</h2><small>Riders pay the fare after acceptance. A payout unlocks after both sides confirm a paid trip.</small></span></div>{accountType!=='rider'&&<button className="button secondary" disabled={busy} onClick={()=>setPayoutSetupOpen(true)}><Landmark size={15}/>{payoutAccount?'Update payout account':'Set up payout account'}</button>}</div>{accountType==='rider'?<p className="note">Switch your account type to Driver or Both to view driver earnings.</p>:<><div className="payout-summary"><div><small>AVAILABLE FOR PAYOUT</small><strong>{money(availablePayoutPaise/100)}</strong></div><div><small>PAYOUT DESTINATION</small><b>{payoutAccount?`${payoutAccount.account_holder_name} · ${payoutAccount.destination_mask}`:'Not set up'}</b></div><div><small>PAYOUT METHOD</small><b>{payoutAccount?.payout_method==='upi'?'UPI':payoutAccount?.payout_method==='bank_account'?'Bank transfer':'—'}</b></div></div>{!isSupabaseConfigured?<p className="note">Demo mode only. Add Supabase and RazorpayX configuration to enable payouts.</p>:!userEmail?<p className="note">Sign in to connect driver profile and payout history to Supabase.</p>:!verified?<p className="note">Driver payout setup is available after Vybe verifies your account.</p>:<p className="note payout-privacy">Payouts are sent from RazorpayX after the ride is marked complete by both rider and driver. Vybe stores the provider reference and a masked destination; bank/UPI details are sent directly to RazorpayX. The fare currently has no Vybe commission deducted.</p>}{driverEarnings.length?driverEarnings.map(earning=>{const canPay=payoutEligible(earning);return <div className="earning-row" key={earning.ride_request_id}><span><b>{earning.origin} → {earning.destination}</b><small>{dateLabel(earning.departure_at)} · payment captured</small></span><strong>{money(earning.amount_paise/100)}</strong>{canPay&&payoutAccount?<button className="button small-action" disabled={busy||!verified} onClick={()=>void requestPayout(earning)}>{busy?'Please wait…':'Pay out'}</button>:earning.payout_status?<span className={`payout-status ${earning.payout_status}`}>{earning.payout_status}{earning.utr?` · UTR ${earning.utr}`:''}</span>:<span className="payout-status waiting">{payoutAccount?'Ready':'Add payout destination'}</span>}</div>;}):<div className="empty payout-empty"><CircleDollarSign/><b>No completed paid trips yet.</b><span>After both people confirm a paid ride, its driver earnings and payout action will appear here.</span></div>}{isSupabaseConfigured&&userEmail&&!payoutAccount&&<p className="note">Run migration 202610100005_driver_map_fares_payouts.sql and deploy the payout functions to connect this section.</p>}</>}</section><section className="page-card payout-history"><h2>Recent driver payouts</h2><p className="muted">Status updates arrive from RazorpayX.</p>{driverPayouts.length?driverPayouts.slice(0,8).map(payout=><div className="wallet-transaction" key={payout.id}><span><b>{money(payout.amount_paise/100)} · {payout.status}</b><small>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(payout.created_at))}{payout.utr?` · UTR ${payout.utr}`:''}{payout.failure_reason?` · ${payout.failure_reason}`:''}</small></span><span className={`payout-status ${payout.status}`}>{payout.status}</span></div>):<p className="empty-copy">No payouts have been requested.</p>}</section></div>}
    </div></main>{toast&&<div className="toast">{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
    {authOpen&&<div className="overlay" onClick={()=>setAuthOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setAuthOpen(false)}><X/></button><h2>{authMode==='sign-up'?'Create your Vybe account':authMode==='reset'?'Reset your password':authMode==='update-password'?'Choose a new password':'Welcome to Vybe'}</h2><p className="muted">{authMode==='sign-up'?'Join your community and commute together.':authMode==='reset'?'We’ll email you a secure password reset link.':authMode==='update-password'?'Choose a new password for your account.':'Sign in to manage rides, payments, and trusted contacts.'}</p>{authMode==='sign-in'&&<div className="auth-switch"><button className="active-auth" type="button">Sign in</button><button type="button" onClick={()=>setAuthMode('sign-up')}>Create account</button></div>}{authMode==='sign-up'&&<div className="auth-switch"><button type="button" onClick={()=>setAuthMode('sign-in')}>Sign in</button><button className="active-auth" type="button">Create account</button></div>}<form onSubmit={authenticate}>{authMode==='sign-up'&&<><label>Your name<input name="name" required autoComplete="name" placeholder="Your name"/></label><fieldset className="account-type-fieldset"><legend>How will you use Vybe?</legend><div className="account-type-options"><label className={accountType==='rider'?'selected':''}><input type="radio" name="account_type" value="rider" checked={accountType==='rider'} onChange={()=>setAccountType('rider')}/><span><b>Rider</b><small>Find and book seats</small></span></label><label className={accountType==='driver'?'selected':''}><input type="radio" name="account_type" value="driver" checked={accountType==='driver'} onChange={()=>setAccountType('driver')}/><span><b>Driver</b><small>Offer rides and book seats</small></span></label><label className={accountType==='both'?'selected':''}><input type="radio" name="account_type" value="both" checked={accountType==='both'} onChange={()=>setAccountType('both')}/><span><b>Both</b><small>Switch between both modes</small></span></label></div><p className="role-note">Drivers can also request seats from other drivers.</p></fieldset></>}{authMode!=='update-password'&&<label>Email<input name="email" type="email" required autoComplete="email" placeholder="you@example.com"/></label>}{authMode!=='reset'&&<label>{authMode==='update-password'?'New password':'Password'}<input name="password" type="password" minLength={authMode==='sign-in'?6:8} required autoComplete={authMode==='sign-in'?'current-password':'new-password'} placeholder={authMode==='sign-in'?'Your password':'At least 8 characters'}/></label>}{authMode==='update-password'&&<label>Confirm new password<input name="confirmPassword" type="password" minLength={8} required autoComplete="new-password" placeholder="Type it again"/></label>}<button className="button full" disabled={busy}>{busy?'Please wait…':authMode==='sign-up'?'Create account':authMode==='reset'?'Send reset link':authMode==='update-password'?'Update password':'Sign in'}</button></form>{authMode==='sign-in'&&<button className="auth-link" type="button" onClick={()=>setAuthMode('reset')}>Forgot your password?</button>}{authMode==='reset'&&<button className="auth-link" type="button" onClick={()=>setAuthMode('sign-in')}>Back to sign in</button>}{!isSupabaseConfigured&&<p className="note">Add your Supabase URL and publishable key in <code>.env</code> to enable accounts.</p>}</div></div>}
    {offerOpen&&<div className="overlay" onClick={()=>setOfferOpen(false)}><div className="modal offer-modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setOfferOpen(false)}><X/></button><h2>Offer a ride</h2><p className="muted">Add your driver and vehicle details, map your route, then set the fare per seat.</p><form onSubmit={publish}><label>From<input required value={offer.origin} onChange={e=>{setOffer({...offer,origin:e.target.value});setOfferRouteDistanceKm(null);}} placeholder="Pickup area"/></label><label>Going to<input required value={offer.destination} onChange={e=>{setOffer({...offer,destination:e.target.value});setOfferRouteDistanceKm(null);}} placeholder="Destination"/></label><button type="button" className="button secondary map-calculate" onClick={()=>{setOfferRouteDistanceKm(null);setOfferRouteRequestId(value=>value+1);}}>Calculate Google Maps route</button>{offerRouteRequestId>0&&<GoogleRouteMap origin={offer.origin} destination={offer.destination} requestId={offerRouteRequestId} onRouteCalculated={updateOfferRoute}/>}<label>Departure<input required type="datetime-local" value={offer.when} onChange={e=>setOffer({...offer,when:e.target.value})}/></label><div className="form-grid"><label>Available seats<input type="number" min="1" max="8" value={offer.seats} onChange={e=>setOffer({...offer,seats:Number(e.target.value)})}/></label><label>Rate per km per seat (₹)<input type="number" min="1" step="0.5" value={offer.rate} onChange={e=>setOffer(current=>({...current,rate:Number(e.target.value)||1,fare:offerRouteDistanceKm?Math.max(1,Math.round(offerRouteDistanceKm*(Number(e.target.value)||1))):current.fare}))}/></label></div><label>Fare per seat (₹)<input type="number" min="1" step="1" value={offer.fare} onChange={e=>setOffer({...offer,fare:Number(e.target.value)})}/><small>{offerRouteDistanceKm?`Suggested from ${offerRouteDistanceKm.toFixed(1)} km × ${money(offer.rate)}/km. Edit the final fare if needed.`:`Suggested starting rate: ${money(offer.rate)}/km. Calculate a route for a distance-based suggestion.`}</small></label><label>Vehicle<input value={offer.vehicle} onChange={e=>setOffer({...offer,vehicle:e.target.value})} placeholder="Make and model"/></label><label className="check-label"><input type="checkbox" checked={offer.women} onChange={e=>setOffer({...offer,women:e.target.checked})}/> Women-only ride</label><p className="note fare-note">Drivers set the final fare. Riders pay the listed fare after acceptance; driver payouts become eligible after both sides confirm completion.</p><button className="button full" disabled={busy}>{busy?'Publishing…':'Publish ride'}</button></form></div></div>}
    {selected&&<div className="overlay" onClick={()=>setSelected(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}><X/></button><span className="tag">{selected.profiles?.verified?'VERIFIED COMMUTER':'COMMUTER'}</span><h2>{selected.profiles?.full_name||'Vybe commuter'}</h2><p className="muted">{selected.vehicle||'Vehicle details pending'} · {selected.profiles?.driver_rating_count?`${Number(selected.profiles.driver_rating_average||0).toFixed(1)} ★ from ${selected.profiles.driver_rating_count} rides`:'New driver · no ratings yet'}</p><div className="detail-route"><b>{selected.origin}</b><ChevronRight/><b>{selected.destination}</b></div><a className="map-route-link" href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(selected.origin)}&destination=${encodeURIComponent(selected.destination)}&travelmode=driving`} target="_blank" rel="noreferrer"><MapPin size={14}/> Open this driver’s route in Google Maps</a>{selected.distance_km&&<div className="detail-row"><span>Driving distance</span><b>{Number(selected.distance_km).toFixed(1)} km · {money(selected.fare_per_seat/Number(selected.distance_km))}/km</b></div>}<div className="detail-row"><span>Departure</span><b>{dateLabel(selected.departure_at)}</b></div><div className="detail-row"><span>Seats available</span><b>{selected.seats_available}</b></div><div className="detail-row"><span>Your share</span><b>{money(selected.fare_per_seat)}</b></div>{selected.notes&&<p className="note">{selected.notes}</p>}<button className="button full" disabled={busy||Boolean(supabase&&userEmail&&!verified)} onClick={()=>void book(selected)}>{supabase&&userEmail&&!verified?'Verification required':'Request a seat'}</button>{supabase&&userEmail&&!verified&&<p className="note">Your account must be verified by Vybe before booking. Self-verification is disabled.</p>}<button className="text-button report-button" onClick={()=>{setReportDetails('');setReportOpen(true);}}>Report this ride or driver</button><small className="muted">Payment is collected only after the driver accepts your request.</small></div></div>}
    {ratingTarget&&<div className="overlay" onClick={()=>setRatingTarget(null)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="rating-title" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setRatingTarget(null)}><X/></button><h2 id="rating-title">Rate your driver</h2><p className="muted">Your rating is saved on the completed ride and contributes to the driver’s profile.</p><form onSubmit={submitDriverReview}><fieldset className="driver-rating-picker"><legend>Your rating</legend><div>{[1,2,3,4,5].map(value=><button key={value} type="button" aria-label={`${value} stars`} aria-pressed={driverRating===value} onClick={()=>setDriverRating(value)}><Star size={25} fill={value<=driverRating?'currentColor':'none'}/></button>)}</div><small>{driverRating} out of 5</small></fieldset><label>Comment (optional)<textarea value={driverReviewComment} onChange={e=>setDriverReviewComment(e.target.value)} maxLength={500} rows={3} placeholder="Share a short note about the ride"/></label><button className="button full" disabled={busy}>{busy?'Saving…':'Submit rating'}</button></form></div></div>}
    {payoutSetupOpen&&<div className="overlay" onClick={()=>setPayoutSetupOpen(false)}><div className="modal payout-modal" role="dialog" aria-modal="true" aria-labelledby="payout-setup-title" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setPayoutSetupOpen(false)}><X/></button><h2 id="payout-setup-title">Driver payout destination</h2><p className="muted">Connect a UPI ID or bank account for ride earnings.</p>{payoutAccount&&<p className="note">Current destination: {payoutAccount.account_holder_name} · {payoutAccount.destination_mask}</p>}<form onSubmit={savePayoutAccount}><label>Account holder name<input name="name" minLength={3} maxLength={50} required defaultValue={payoutAccount?.account_holder_name||userName} autoComplete="name"/></label><label>Mobile number<input name="phone" type="tel" required autoComplete="tel" placeholder="10-digit mobile number"/></label><label>Payout method<select value={payoutMethod} onChange={e=>setPayoutMethod(e.target.value as 'upi'|'bank_account')}><option value="upi">UPI</option><option value="bank_account">Bank account</option></select></label>{payoutMethod==='upi'?<label>UPI ID<input name="vpa" required autoComplete="off" placeholder="name@bank"/></label>:<><label>Bank account number<input name="account_number" inputMode="numeric" autoComplete="off" required placeholder="Account number"/></label><label>IFSC code<input name="ifsc" autoComplete="off" required maxLength={11} placeholder="ABCD0123456"/></label></>}<p className="note">Details are submitted securely through Vybe’s Supabase payout function and forwarded to RazorpayX. Vybe’s database stores only the provider reference and a masked destination, not the raw bank or UPI value.</p><button className="button full" disabled={busy}>{busy?'Connecting…':'Save payout destination'}</button></form></div></div>}
    {reportOpen&&selected&&<div className="overlay" onClick={()=>setReportOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setReportOpen(false)}><X/></button><h2>Report a safety concern</h2><p className="muted">Reports are private and sent to the Vybe safety queue.</p><form onSubmit={submitReport}><label>Reason<select value={reportCategory} onChange={e=>setReportCategory(e.target.value)}><option value="safety_concern">Safety concern</option><option value="harassment">Harassment</option><option value="misleading_ride">Misleading ride details</option><option value="other">Other</option></select></label><label>Details<textarea value={reportDetails} onChange={e=>setReportDetails(e.target.value)} rows={4} placeholder="Share what happened"/></label><button className="button full" disabled={busy}>{busy?'Sending…':'Send report'}</button></form>{!supabase&&<p className="note">Reports are saved only after Supabase is configured and you sign in.</p>}</div></div>}
    {sosOpen&&<div className="overlay" onClick={()=>setSosOpen(false)}><div className="modal sos-modal" role="dialog" aria-modal="true" aria-labelledby="sos-title" onClick={e=>e.stopPropagation()}><button className="close" aria-label="Close SOS" onClick={()=>setSosOpen(false)}><X/></button><div className="sos-modal-icon"><ShieldAlert/></div><h2 id="sos-title">SOS help</h2><p className="muted">Prepare a message for someone you trust. Vybe will open your SMS app; you choose whether to send it.</p>{phoneContacts.length>0?<label>Trusted contact<select value={sosContact?.id||''} onChange={e=>setSosContactId(e.target.value)}>{phoneContacts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label>:<p className="note">No trusted phone contacts yet. Add a contact with a phone number on the Safety page to send an SOS text.</p>}<div className="sos-location-row"><button className="button secondary" disabled={sosLocationBusy} onClick={prepareSosLocation}><LocateFixed size={16}/>{sosLocationBusy?'Getting location…':sosLocation?'Refresh location':'Add current location'}</button>{sosLocation&&<span className="sos-location-status">Location added to preview</span>}</div>{sosLocationError&&<p className="sos-error" role="status">{sosLocationError}</p>}<div className="sos-preview"><b>Message preview</b><p>{sosMessage}</p></div><p className="sos-privacy">Your location is included only after you choose to add it. Nothing is sent until you press Send in your SMS app.</p><button className="button full" disabled={!sosContact} onClick={openSosSms}><MessageSquare size={16}/>{sosContact?'Open SMS app':'Add a phone contact to text'}</button><button className="sos-call" onClick={callEmergencyServices}><Phone size={16}/> Call emergency services · 112</button>{!sosContact&&<button className="sos-copy" onClick={()=>void copySosMessage()}>Copy alert message</button>}</div></div>}
  </div>;
}
