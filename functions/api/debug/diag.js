export const onRequestGet = async ({ env }) =>
  new Response(JSON.stringify({
    has_TELNYX_API_KEY: !!env.TELNYX_API_KEY,
    has_TELNYX_MSG_PROFILE: !!env.TELNYX_MESSAGING_PROFILE_ID,
    has_TELNYX_FROM_NUMBER: !!env.TELNYX_FROM_NUMBER,
  }), { headers: { "content-type":"application/json", "Access-Control-Allow-Origin":"*" }});
