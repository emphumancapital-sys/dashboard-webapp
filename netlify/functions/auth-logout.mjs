import { json } from "./_lib/http.mjs";
import { clearSessionCookie } from "./_lib/auth.mjs";
export default async (event)=>{
  if(event.httpMethod!=="POST")return json(405,{error:"Method not allowed"});
  return json(200,{success:true},{"Set-Cookie":clearSessionCookie()});
};
