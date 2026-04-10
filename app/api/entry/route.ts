import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { accessCode?: string };
  const submittedCode = body.accessCode?.trim();
  const expectedCode = process.env.SITE_ACCESS_CODE?.trim();

  if (!expectedCode) {
    return NextResponse.json(
      { ok: false, message: "SITE_ACCESS_CODE is not configured." },
      { status: 500 }
    );
  }

  if (!submittedCode || submittedCode !== expectedCode) {
    return NextResponse.json(
      { ok: false, message: "That room code does not match." },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
