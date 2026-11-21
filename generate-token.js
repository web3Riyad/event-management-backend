import "dotenv/config";
import { signJwt, verifyJwt } from "./jwt.js";

const email = process.argv[2] || "user@example.com";
const name = process.argv[3] || "Riyad Khandakar";
const role = "user";

const token = signJwt({
  id: "user_" + Date.now(),
  email,
  name,
  role,
}, 30 * 24 * 3600); // 30 days validity

const verified = verifyJwt(token);

console.log("\n==================================================================");
console.log("🔑 JWT TOKEN GENERATED SUCCESSFULLY:");
console.log("==================================================================");
console.log(token);
console.log("==================================================================");
console.log("✅ VERIFIED PAYLOAD:");
console.log(JSON.stringify(verified, null, 2));
console.log("==================================================================");
console.log("💡 You can copy this token and paste it into your .env file or use as:");
console.log("   Authorization: Bearer " + token);
console.log("==================================================================\n");
