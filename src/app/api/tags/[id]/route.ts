import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { deleteTagGlobally } from "@/lib/tags-service";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await deleteTagGlobally(id);
  return NextResponse.json({ ok: true });
}
