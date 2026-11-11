/**
 * One-time: enable TOTP multi-factor for the Firebase project (requires the
 * "Identity Platform" upgrade in Firebase Console → Authentication → Settings).
 *   npm run firebase:enable-totp
 */
import "dotenv/config";
import { adminAuth } from "../src/lib/firebase/admin";

adminAuth()
  .projectConfigManager()
  .updateProjectConfig({ multiFactorConfig: { state: "ENABLED", providerConfigs: [{ state: "ENABLED", totpProviderConfig: { adjacentIntervals: 1 } }] } })
  .then(() => {
    console.log("✓ TOTP multi-factor enabled");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
