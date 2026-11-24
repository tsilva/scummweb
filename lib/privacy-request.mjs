export const privacyRequestTypes = [
  ["access", "Access my data"],
  ["correction", "Correct my data"],
  ["deletion", "Delete my data"],
  ["restriction", "Restrict use of my data"],
  ["portability", "Get a portable copy"],
  ["object", "Object or withdraw consent"],
  ["other", "Other privacy request"],
];

export const privacyRequestLimits = { replyTo: 254, message: 4000 };

export function isPrivacyRequestEmail(value) {
  return typeof value === "string"
    && value.length <= privacyRequestLimits.replyTo
    && /^[a-z0-9.!#$%&'*+/=?^`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value);
}
