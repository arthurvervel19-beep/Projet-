#!/usr/bin/env bash
# Fabrique l'application Android (APK) à partir du dossier public/ du jeu.
#
#   bash android/build-apk.sh
#
# Résultat : android/build/aube-des-royaumes.apk
# Il faut un JDK (17 ou plus récent), curl, zip et unzip. Les outils Android nécessaires
# (aapt2, dx, signature) sont téléchargés une fois dans android/.cache.
set -euo pipefail
cd "$(dirname "$0")"

CACHE=.cache
OUT=build
MAVEN=https://repo.maven.apache.org/maven2

mkdir -p "$CACHE"
empreinte() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
telecharge() { # fichier, adresse, empreinte SHA-256 attendue
  if [ ! -s "$CACHE/$1" ]; then
    echo "Téléchargement de $1…"
    curl -fsSL --retry 4 --retry-delay 5 -o "$CACHE/$1.part" "$2"
    mv "$CACHE/$1.part" "$CACHE/$1"
  fi
  # chaque outil est vérifié : un fichier altéré arrête la fabrication
  if [ "$(empreinte "$CACHE/$1")" != "$3" ]; then echo "Empreinte inattendue pour $1 : fabrication arrêtée." >&2; exit 1; fi
}
telecharge apktool-lib.jar "$MAVEN/org/apktool/apktool-lib/2.12.1/apktool-lib-2.12.1.jar" \
  8e1e517ba30f579d4f6cf87c806c6b8535f93db6495471ecddf7a36080a21784
telecharge dx.jar "$MAVEN/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar" \
  1e4b645628e3bdb097b5331d669e177ef235a551582a8c646dbe36865e541907
telecharge android-all.jar "$MAVEN/org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar" \
  6be2218c6a53fe3c57bc22ebdc723edcb7270a8a6f187545708aa5c0ed813977
telecharge uber-apk-signer.jar "https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar" \
  e1299fd6fcf4da527dd53735b56127e8ea922a321128123b9c32d619bba1d835

# aapt2 et les ressources du système Android sont fournis par Apktool
case "$(uname -s)" in
  Darwin) AAPT_SRC=prebuilt/macosx/aapt2_64 ;;
  *) AAPT_SRC=prebuilt/linux/aapt2_64 ;;
esac
if [ ! -x "$CACHE/aapt2" ]; then
  unzip -o -j -q "$CACHE/apktool-lib.jar" "$AAPT_SRC" prebuilt/android-framework.jar -d "$CACHE"
  mv "$CACHE/aapt2_64" "$CACHE/aapt2"
  chmod +x "$CACHE/aapt2"
fi
AAPT2="$CACHE/aapt2"

# numéro de version : nombre de commits du dépôt
CODE="$(git rev-list --count HEAD 2>/dev/null || echo 1)"
NOM="1.0.$CODE"

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/assets"
echo "Copie du jeu…"
cp -R ../public "$OUT/assets/www"

echo "Ressources et manifeste…"
"$AAPT2" compile --dir res -o "$OUT/res.zip"
"$AAPT2" link -o "$OUT/app.apk" -I "$CACHE/android-framework.jar" --manifest AndroidManifest.xml -A "$OUT/assets" \
  --min-sdk-version 24 --target-sdk-version 34 --compile-sdk-version-code 34 --compile-sdk-version-name 14 \
  --version-code "$CODE" --version-name "$NOM" "$OUT/res.zip"

echo "Compilation du code…"
javac --release 8 -Xlint:-options -cp "$CACHE/android-all.jar" -d "$OUT/classes" $(find src -name '*.java')
java -cp "$CACHE/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q app.apk classes.dex)

# Clé de signature : propre à cette machine, jamais enregistrée dans le dépôt.
# Android exige la même clé pour mettre à jour une application déjà installée : si la clé a
# changé (autre machine), il suffit de désinstaller l'ancienne version avant d'installer la nouvelle.
CLE="${CLE:-$CACHE/signature.keystore}"
SECRET="${SECRET:-$CACHE/signature.secret}"
if [ ! -f "$CLE" ]; then
  head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$SECRET"
  chmod 600 "$SECRET"
  keytool -genkeypair -keystore "$CLE" -storetype PKCS12 -storepass:file "$SECRET" -alias aube \
    -keyalg RSA -keysize 2048 -validity 18250 -dname "CN=Aube des Royaumes, C=FR" >/dev/null
fi

echo "Alignement et signature…"
java -jar "$CACHE/uber-apk-signer.jar" --apks "$OUT/app.apk" --ks "$CLE" --ksAlias aube \
  --ksPass "$(cat "$SECRET")" --ksKeyPass "$(cat "$SECRET")" --out "$OUT/signe" >"$OUT/signature.txt" 2>&1 \
  || { cat "$OUT/signature.txt"; exit 1; }
mv "$OUT"/signe/*.apk "$OUT/aube-des-royaumes.apk"

echo
"$AAPT2" dump badging "$OUT/aube-des-royaumes.apk" | grep -E "^package|^sdkVersion|^targetSdkVersion|^launchable-activity|^application-label:" || true
grep -iE "verif|signature" "$OUT/signature.txt" | head -8 || true
echo
ls -lh "$OUT/aube-des-royaumes.apk"
echo "Application prête : android/$OUT/aube-des-royaumes.apk (version $NOM)"
