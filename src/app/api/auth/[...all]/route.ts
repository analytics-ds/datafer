import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function handler(req: Request) {
  return getAuth().handler(req);
}

export { handler as GET, handler as POST };
