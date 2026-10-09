package com.vybe.carpool;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.webkit.GeolocationPermissions;
import android.widget.Toast;

import com.razorpay.Checkout;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import org.json.JSONObject;

public final class MainActivity extends Activity implements PaymentResultWithDataListener {
    private static final String APP_HOST = "localhost";
    private static final String START_URL = "https://localhost/index.html";
    private static final int LOCATION_PERMISSION_REQUEST = 2401;
    private static final int BRAND_BACKGROUND = Color.rgb(247, 248, 245);
    private WebView webView;
    private String pendingAuthCallback;
    private boolean pageLoaded;
    private GeolocationPermissions.Callback pendingLocationCallback;
    private String pendingLocationOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();

        webView = new WebView(this);
        webView.setBackgroundColor(BRAND_BACKGROUND);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        webView.addJavascriptInterface(new AndroidBridge(), "VybeAndroid");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!("https://" + APP_HOST).equals(origin)) {
                    callback.invoke(origin, false, false);
                    return;
                }
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    return;
                }
                if (pendingLocationCallback != null) pendingLocationCallback.invoke(pendingLocationOrigin, false, false);
                pendingLocationCallback = callback;
                pendingLocationOrigin = origin;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_PERMISSION_REQUEST);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && APP_HOST.equals(uri.getHost())) return false;
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException ignored) {
                        // Leave the app open when no browser can handle the link.
                    }
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme()) || !APP_HOST.equals(uri.getHost())) {
                    return super.shouldInterceptRequest(view, request);
                }

                String path = uri.getPath();
                if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
                if (path.contains("..") || path.indexOf('\\') >= 0) return notFound();

                try {
                    String assetPath = "public" + path;
                    return new WebResourceResponse(mimeType(path), "UTF-8", getAssets().open(assetPath));
                } catch (IOException ignored) {
                    return notFound();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageLoaded = true;
                dispatchPendingAuthCallback();
            }
        });

        setContentView(webView);
        webView.loadUrl(START_URL);
        acceptAuthCallback(getIntent());
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != LOCATION_PERMISSION_REQUEST || pendingLocationCallback == null) return;
        GeolocationPermissions.Callback callback = pendingLocationCallback;
        String origin = pendingLocationOrigin;
        pendingLocationCallback = null;
        pendingLocationOrigin = null;
        callback.invoke(origin, hasLocationPermission(), false);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        acceptAuthCallback(intent);
    }

    private void acceptAuthCallback(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null || !"vybe".equals(uri.getScheme()) || !"auth".equals(uri.getHost())
                || !"/callback".equals(uri.getPath())) return;
        pendingAuthCallback = uri.toString();
        dispatchPendingAuthCallback();
    }

    private void dispatchPendingAuthCallback() {
        if (webView == null || !pageLoaded || pendingAuthCallback == null) return;
        String callback = pendingAuthCallback;
        pendingAuthCallback = null;
        webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('vybe:auth-callback',{detail:" + JSONObject.quote(callback) + "}));",
                null);
    }

    @Override
    public void onPaymentSuccess(String paymentId, PaymentData paymentData) {
        JSONObject data = paymentData == null ? new JSONObject() : paymentData.getData();
        String orderId = data.optString("razorpay_order_id", "");
        String signature = data.optString("razorpay_signature", "");
        JSONObject response = new JSONObject();
        try {
            response.put("razorpay_payment_id", paymentId);
            response.put("razorpay_order_id", orderId);
            response.put("razorpay_signature", signature);
        } catch (org.json.JSONException ignored) {
            dispatchPaymentFailure("Payment response could not be read. Contact support before retrying.");
            return;
        }
        String payload = response.toString();
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('vybe:razorpay-success',{detail:" + payload + "}));", null);
        });
    }

    @Override
    public void onPaymentError(int code, String response, PaymentData paymentData) {
        String message = response == null || response.isEmpty() ? "Payment cancelled or failed." : response;
        dispatchPaymentFailure(message);
    }

    private void dispatchPaymentFailure(String message) {
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('vybe:razorpay-failure',{detail:" + JSONObject.quote(message) + "}));", null);
        });
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public boolean openSmsComposer(String phone, String message) {
            if (phone == null || message == null || phone.length() > 40 || message.length() > 1200) return false;
            String safePhone = phone.replaceAll("[^0-9+() .-]", "").trim();
            if (safePhone.isEmpty()) return false;
            Intent intent = new Intent(Intent.ACTION_SENDTO);
            intent.setData(Uri.fromParts("smsto", safePhone, null));
            intent.putExtra("sms_body", message);
            runOnUiThread(() -> {
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException exception) {
                    Toast.makeText(MainActivity.this, "No SMS app is available on this device.", Toast.LENGTH_LONG).show();
                }
            });
            return true;
        }

        @JavascriptInterface
        public boolean openEmergencyDialer(String phone) {
            if (phone == null || !"112".equals(phone)) return false;
            Intent intent = new Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", phone, null));
            runOnUiThread(() -> {
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException exception) {
                    Toast.makeText(MainActivity.this, "No phone app is available on this device.", Toast.LENGTH_LONG).show();
                }
            });
            return true;
        }

        @JavascriptInterface
        public boolean openRazorpayCheckout(String optionsJson) {
            if (optionsJson == null || optionsJson.length() > 12000) return false;
            final JSONObject options;
            try {
                options = new JSONObject(optionsJson);
            } catch (org.json.JSONException exception) {
                return false;
            }
            String keyId = options.optString("key", "");
            String orderId = options.optString("order_id", "");
            if (!(keyId.startsWith("rzp_test_") || keyId.startsWith("rzp_live_"))
                    || !orderId.startsWith("order_")
                    || options.optInt("amount", 0) <= 0
                    || !"INR".equals(options.optString("currency", ""))) return false;

            runOnUiThread(() -> {
                try {
                    Checkout checkout = new Checkout();
                    checkout.setKeyID(keyId);
                    checkout.open(MainActivity.this, options);
                } catch (Exception exception) {
                    dispatchPaymentFailure("Could not open Razorpay checkout. Please retry.");
                }
            });
            return true;
        }
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(BRAND_BACKGROUND);
        window.setNavigationBarColor(BRAND_BACKGROUND);
        window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            window.getDecorView().setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        return "application/octet-stream";
    }

    private static WebResourceResponse notFound() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", headers,
                new ByteArrayInputStream(new byte[0]));
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
