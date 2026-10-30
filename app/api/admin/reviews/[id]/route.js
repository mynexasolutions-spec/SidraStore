import { NextResponse } from "next/server";
import { createAdminCatalogClient, isAuthorizedAdminRequest } from "@/lib/adminCatalog";

export async function PATCH(request, { params }) {
  if (!isAuthorizedAdminRequest(request)) return NextResponse.json({ error: "Administrator authentication is required." }, { status: 401 });
  const body = await request.json();
  const payload = {};
  if (Object.hasOwn(body, "status")) {
    payload.status = String(body.status || "").trim().toLowerCase();
    if (!["pending", "approved", "rejected"].includes(payload.status)) return NextResponse.json({ error: "Review status must be pending, approved, or rejected." }, { status: 400 });
  }
  if (Object.hasOwn(body, "is_approved")) payload.status = body.is_approved === true ? "approved" : "rejected";
  if (Object.hasOwn(body, "rating")) {
    payload.rating = Number(body.rating);
    if (!Number.isInteger(payload.rating) || payload.rating < 1 || payload.rating > 5) return NextResponse.json({ error: "Rating must be between 1 and 5." }, { status: 400 });
  }
  for (const field of ["customer_name", "title", "body"]) if (Object.hasOwn(body, field)) payload[field] = String(body[field] || "").trim() || null;
  if (!Object.keys(payload).length) return NextResponse.json({ error: "No review changes were provided." }, { status: 400 });
  const { data, error } = await createAdminCatalogClient().from("reviews").update(payload).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ review: data });
}

export async function DELETE(request, { params }) {
  if (!isAuthorizedAdminRequest(request)) return NextResponse.json({ error: "Administrator authentication is required." }, { status: 401 });
  const { error } = await createAdminCatalogClient().from("reviews").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
