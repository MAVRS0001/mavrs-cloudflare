export const onRequestGet = async ({ env }) => {
  const keys = [
    "TELNYX_API_KEY",
    "TELNYX_MESSAGING_PROFILE_ID",
    "TELNYX_FROM_NUMBER",
    "GMAPS_GEOCODING_KEY"
  ];
  const report = {};
  for (const k of keys) {
    const present = Object.prototype.hasOwnProperty.call(env, k);
    const value = present ? String(env[k] ?? "") : "";
    report[k] = { present, nonEmpty: present && value.trim().length > 0, length: value.length };
  }
  return new Response(JSON.stringify(report, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
};
