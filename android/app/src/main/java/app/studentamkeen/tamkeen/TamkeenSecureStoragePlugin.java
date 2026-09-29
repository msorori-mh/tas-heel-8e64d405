package app.studentamkeen.tamkeen;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Device-bound auth storage. Plaintext exists only in memory/bridge responses. */
@CapacitorPlugin(name = "TamkeenSecureStorage")
public class TamkeenSecureStoragePlugin extends Plugin {
    private static final String KEY_ALIAS = "tamkeen.auth.aes.v1";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    private SharedPreferences store() {
        return getContext().getSharedPreferences("tamkeen.auth.encrypted.v1", Context.MODE_PRIVATE);
    }
    private String key(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.length() > 256 || !key.matches("sb-[a-zA-Z0-9_.:-]+")) {
            throw new IllegalArgumentException("AUTH_STORAGE_KEY_INVALID");
        }
        return key;
    }
    private SecretKey secret() throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
        keys.load(null);
        if (keys.containsAlias(KEY_ALIAS)) return (SecretKey) keys.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    @PluginMethod
    public void get(PluginCall call) {
        worker.execute(() -> {
            try {
                String key = key(call);
                String saved = store().getString(key, null);
                JSObject result = new JSObject();
                if (saved == null) { result.put("value", JSONObject.NULL); call.resolve(result); return; }
                JSONObject envelope = new JSONObject(saved);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, secret(), new GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)));
                cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
                byte[] plain = cipher.doFinal(Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP));
                result.put("value", new String(plain, StandardCharsets.UTF_8));
                call.resolve(result);
            } catch (Exception error) { call.reject("AUTH_STORAGE_READ_FAILED"); }
        });
    }
    @PluginMethod
    public void set(PluginCall call) {
        worker.execute(() -> {
            try {
                String key = key(call); String value = call.getString("value");
                if (value == null || value.length() > 262144) throw new IllegalArgumentException();
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, secret());
                cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
                JSONObject envelope = new JSONObject();
                envelope.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
                envelope.put("ciphertext", Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
                if (!store().edit().putString(key, envelope.toString()).commit()) throw new IllegalStateException();
                call.resolve();
            } catch (Exception error) { call.reject("AUTH_STORAGE_WRITE_FAILED"); }
        });
    }
    @PluginMethod
    public void remove(PluginCall call) {
        worker.execute(() -> {
            try {
                if (!store().edit().remove(key(call)).commit()) throw new IllegalStateException();
                call.resolve();
            } catch (Exception error) { call.reject("AUTH_STORAGE_REMOVE_FAILED"); }
        });
    }
    @Override
    protected void handleOnDestroy() {
        worker.shutdown();
        super.handleOnDestroy();
    }
}
