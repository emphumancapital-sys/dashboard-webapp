import { json } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
export default async (event)=>{
  try{const user=await requireAdmin(event);return json(200,{authenticated:!!user,user:user?{username:user.username,fullName:user.fullName,role:user.role}:null});}
  catch(e){return json(500,{error:e.message});}
};
