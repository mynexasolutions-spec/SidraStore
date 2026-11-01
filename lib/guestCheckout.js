const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+() -]{7,20}$/;
const postalCodePattern = /^[0-9]{6}$/;

function readText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseGuestCheckoutPayload(input) {
  const source = input && typeof input === "object" ? input : {};
  const fullName = readText(source.fullName);
  const email = readText(source.email).toLowerCase();
  const phone = readText(source.phone);
  const address = source.address && typeof source.address === "object" ? source.address : {};
  const addressLine1 = readText(address.address_line_1);
  const addressLine2 = readText(address.address_line_2);
  const city = readText(address.city);
  const state = readText(address.state);
  const postalCode = readText(address.postal_code);
  const items = Array.isArray(source.items)
    ? source.items.map((item) => ({
      slug: readText(item?.slug),
      quantity: Number(item?.quantity),
      variant_size: readText(item?.variant_size) || null,
    }))
    : [];

  if (fullName.length < 2 || fullName.length > 120) return { error: "Enter your full name." };
  if (!emailPattern.test(email) || email.length > 254) return { error: "Enter a valid email address." };
  if (!phonePattern.test(phone)) return { error: "Enter a valid phone number." };
  if (addressLine1.length < 5 || addressLine1.length > 240) return { error: "Enter a complete delivery address." };
  if (addressLine2.length > 240) return { error: "The address line is too long." };
  if (city.length < 2 || city.length > 80 || state.length < 2 || state.length > 80) return { error: "Enter a valid city and state." };
  if (!postalCodePattern.test(postalCode)) return { error: "Enter a valid 6-digit PIN code." };
  if (items.length === 0 || items.length > 50 || items.some((item) => !item.slug || item.slug.length > 160 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 25 || item.variant_size?.length > 80)) {
    return { error: "Your cart contains invalid items. Please refresh and try again." };
  }

  return {
    data: {
      fullName,
      email,
      phone,
      address: {
        recipient_name: fullName,
        address_line_1: addressLine1,
        address_line_2: addressLine2 || null,
        city,
        state,
        postal_code: postalCode,
        country: "India",
      },
      items,
    },
  };
}
