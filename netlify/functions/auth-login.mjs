import { json, bodyOf } from "./_lib/http.mjs";
import { ensureSystemSheets, getUsers } from "./_lib/sheets.mjs";
import { verifyPassword, createSession, sessionCookie } from "./_lib/auth.mjs";

export const handler = async (event) => {
  if(event.httpMethod!=="POST")return json(405,{error:"Method not allowed"});
  try{
    await ensureSystemSheets();
    const {username="",password=""}=bodyOf(event);
    if(!username||!password)return json(400,{error:"Username and password are required."});
    const users=await getUsers();
    const user=users.find(u=>u.username.toLowerCase()===String(username).trim().toLowerCase());
    if(!user||user.status!=="Active"||user.role!=="Admin"||!verifyPassword(password,user.passwordHash)){
      return json(401,{error:"Invalid username or password."});
    }
    const token=createSession(user);
    return json(200,{success:true,user:{username:user.username,fullName:user.fullName,role:user.role}},{ "Set-Cookie":sessionCookie(token) });
  }catch(e){return json(500,{error:e.message||"Login failed"});}
};
