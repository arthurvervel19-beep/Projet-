package fr.aubedesroyaumes.jeu;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Aube des Royaumes pour Android.
 *
 * Le jeu (dossier public/ du projet) est copié dans l'APK, sous assets/www. Cette activité
 * l'affiche en plein écran dans un WebView et lui sert ses fichiers directement depuis l'APK.
 * Rien n'est téléchargé : toute adresse autre que celle du jeu embarqué est refusée.
 */
public class MainActivity extends Activity {

    /** Adresse fictive sous laquelle les fichiers embarqués sont servis (origine sécurisée). */
    static final String HOTE = "appassets.androidplatform.net";
    static final String ACCUEIL = "https://" + HOTE + "/index.html";

    private WebView vue;
    private Voix voix;

    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        vue = new WebView(this);
        vue.setBackgroundColor(Color.rgb(7, 9, 12));
        vue.setOverScrollMode(View.OVER_SCROLL_NEVER);
        vue.setVerticalScrollBarEnabled(false);
        vue.setHorizontalScrollBarEnabled(false);
        vue.setHapticFeedbackEnabled(false);
        // pas de menu « copier / coller » sur un appui long
        vue.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                return true;
            }
        });

        WebSettings reglages = vue.getSettings();
        reglages.setJavaScriptEnabled(true);
        reglages.setDomStorageEnabled(true);
        reglages.setMediaPlaybackRequiresUserGesture(false);
        reglages.setTextZoom(100);
        reglages.setSupportZoom(false);
        reglages.setBuiltInZoomControls(false);
        reglages.setDisplayZoomControls(false);
        reglages.setAllowFileAccess(false);
        reglages.setAllowContentAccess(false);

        vue.setWebViewClient(new Fichiers());
        voix = new Voix();
        vue.addJavascriptInterface(voix, "AndroidVoix");
        vue.addJavascriptInterface(new Appli(), "AndroidApp");

        setContentView(vue);
        pleinEcran();
        vue.loadUrl(ACCUEIL);
    }

    /** Masque la barre d'état et les boutons de navigation (ils reviennent en balayant le bord). */
    @SuppressWarnings("deprecation")
    private void pleinEcran() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean actif) {
        super.onWindowFocusChanged(actif);
        if (actif) pleinEcran();
    }

    /** Touche « retour » : le jeu annule l'action en cours ou se met en pause ; on quitte depuis le menu. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (vue == null) {
            finish();
            return;
        }
        vue.evaluateJavascript("(window.__androidBack ? window.__androidBack() : 'exit')", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String reponse) {
                if (reponse == null || reponse.contains("exit")) finish();
            }
        });
    }

    @Override
    protected void onPause() {
        // la partie se met en pause et le son se coupe quand l'application passe en arrière-plan
        if (vue != null) {
            vue.evaluateJavascript("window.__appPause && window.__appPause()", null);
            vue.onPause();
        }
        if (voix != null) voix.stop();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (vue != null) {
            vue.onResume();
            vue.evaluateJavascript("window.__appResume && window.__appResume()", null);
        }
        pleinEcran();
    }

    @Override
    protected void onDestroy() {
        if (voix != null) voix.fermer();
        if (vue != null) {
            vue.loadUrl("about:blank");
            vue.destroy();
            vue = null;
        }
        super.onDestroy();
    }

    // ------------------------------------------------------------------ fichiers du jeu

    static String typeDe(String chemin) {
        String c = chemin.toLowerCase(Locale.ROOT);
        if (c.endsWith(".html")) return "text/html";
        if (c.endsWith(".js")) return "text/javascript";
        if (c.endsWith(".css")) return "text/css";
        if (c.endsWith(".json")) return "application/json";
        if (c.endsWith(".webmanifest")) return "application/manifest+json";
        if (c.endsWith(".png")) return "image/png";
        if (c.endsWith(".svg")) return "image/svg+xml";
        if (c.endsWith(".ico")) return "image/x-icon";
        if (c.endsWith(".woff2")) return "font/woff2";
        if (c.endsWith(".wav")) return "audio/wav";
        if (c.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    static boolean estTexte(String type) {
        return type.startsWith("text/") || type.contains("json") || type.contains("svg");
    }

    private static WebResourceResponse introuvable() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Introuvable",
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    private class Fichiers extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest demande) {
            Uri adresse = demande.getUrl();
            if (adresse == null || !HOTE.equals(adresse.getHost())) return introuvable();
            String chemin = adresse.getPath();
            if (chemin == null || chemin.isEmpty() || chemin.endsWith("/")) chemin = (chemin == null ? "/" : chemin) + "index.html";
            if (chemin.contains("..")) return introuvable();
            try {
                InputStream flux = getAssets().open("www" + chemin);
                String type = typeDe(chemin);
                Map<String, String> entetes = new HashMap<String, String>();
                entetes.put("Cache-Control", "no-cache");
                return new WebResourceResponse(type, estTexte(type) ? "utf-8" : null, 200, "OK", entetes, flux);
            } catch (IOException absent) {
                return introuvable();
            }
        }

        /** Le jeu ne quitte jamais ses propres pages. */
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest demande) {
            Uri adresse = demande.getUrl();
            return adresse == null || !HOTE.equals(adresse.getHost());
        }
    }

    // ------------------------------------------------------------------ passerelles vers le jeu

    /** Présence de l'application (le jeu s'en sert pour ne pas demander le plein écran du navigateur). */
    public static class Appli {
        @JavascriptInterface
        public String plateforme() {
            return "android";
        }
    }

    /** Voix des unités : synthèse vocale française du téléphone, si elle est installée. */
    public class Voix implements TextToSpeech.OnInitListener {
        private TextToSpeech synthese;
        private volatile boolean pret;

        Voix() {
            try {
                synthese = new TextToSpeech(getApplicationContext(), this);
            } catch (Throwable erreur) {
                synthese = null;
            }
        }

        @Override
        public void onInit(int statut) {
            if (statut != TextToSpeech.SUCCESS || synthese == null) return;
            try {
                int langue = synthese.setLanguage(Locale.FRENCH);
                pret = langue != TextToSpeech.LANG_MISSING_DATA && langue != TextToSpeech.LANG_NOT_SUPPORTED;
            } catch (Throwable erreur) {
                pret = false;
            }
        }

        @JavascriptInterface
        public boolean pret() {
            return pret;
        }

        @JavascriptInterface
        public void dire(String texte, float hauteur, float vitesse, float volume) {
            if (!pret || texte == null) return;
            try {
                synthese.setPitch(Math.max(0.3f, Math.min(2f, hauteur)));
                synthese.setSpeechRate(Math.max(0.5f, Math.min(2f, vitesse)));
                Bundle options = new Bundle();
                options.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0f, Math.min(1f, volume)));
                synthese.speak(texte, TextToSpeech.QUEUE_FLUSH, options, "voix");
            } catch (Throwable erreur) {
                // la voix est un agrément : on continue sans elle
            }
        }

        @JavascriptInterface
        public void stop() {
            try {
                if (synthese != null) synthese.stop();
            } catch (Throwable erreur) {
                // rien à arrêter
            }
        }

        void fermer() {
            try {
                if (synthese != null) synthese.shutdown();
            } catch (Throwable erreur) {
                // déjà fermé
            }
        }
    }
}
