import { json, bodyOf } from "./_lib/http.mjs";
import { requireAdmin, hashPassword } from "./_lib/auth.mjs";
import { ensureSystemSheets, getUsers, appendUser, updateUser, addActivity } from "./_lib/sheets.mjs";

export default async (event)=>{
  try{
    const actor=await requireAdmin(event);
    if(!actor)return json(401,{error:"Admin authentication required."});
    await ensureSystemSheets();
    if(event.httpMethod==="GET"){
      const users=await getUsers();
      return json(200,{users:users.map(({passwordHash,...u})=>u)});
    }
    const body=bodyOf(event), users=await getUsers(), now=new Date().toISOString();
    if(event.httpMethod==="POST"){
      const username=String(body.username||"").trim(), fullName=String(body.fullName||"").trim();
      const role=String(body.role||"Admin"), status=String(body.status||"Active");
      const original=String(body.originalUsername||"").trim();
      if(!/^[a-zA-Z0-9._-]{3,40}$/.test(username))return json(400,{error:"Username must be 3–40 characters (letters, numbers, dot, underscore, hyphen)."});
      if(!fullName)return json(400,{error:"Full name is required."});
      if(role!=="Admin"||!["Active","Inactive"].includes(status))return json(400,{error:"Invalid role or status."});
      const existing=users.find(u=>u.username.toLowerCase()=== (original||username).toLowerCase());
      if(users.some(u=>u.username.toLowerCase()===username.toLowerCase()&&u.username.toLowerCase()!==(original||"").toLowerCase()))return json(409,{error:"Username already exists."});
      if(!existing&&!body.password)return json(400,{error:"Password is required for a new user."});
      if(body.password&&String(body.password).length<8)return json(400,{error:"Password must be at least 8 characters."});
      if(existing){
        if(existing.username===actor.username&&status==="Inactive")return json(400,{error:"You cannot deactivate your own account."});
        const passwordHash=body.password?hashPassword(body.password):existing.passwordHash;
        await updateUser(existing.rowNumber,[username,passwordHash,fullName,role,status,existing.createdAt||now,now]);
        await addActivity(actor.username,"Updated user","User Management",username,`${fullName} · ${role} · ${status}`);
      }else{
        await appendUser([username,hashPassword(body.password),fullName,role,status,now,now]);
        await addActivity(actor.username,"Added user","User Management",username,`${fullName} · ${role}`);
      }
      return json(200,{success:true});
    }
    if(event.httpMethod==="PATCH"){
      const username=String(body.username||"").trim(),status=String(body.status||"");
      if(!["Active","Inactive"].includes(status))return json(400,{error:"Invalid status."});
      if(username.toLowerCase()===actor.username.toLowerCase()&&status==="Inactive")return json(400,{error:"You cannot deactivate your own account."});
      const u=users.find(x=>x.username.toLowerCase()===username.toLowerCase());
      if(!u)return json(404,{error:"User not found."});
      await updateUser(u.rowNumber,[u.username,u.passwordHash,u.fullName,u.role,status,u.createdAt,now]);
      await addActivity(actor.username,status==="Active"?"Activated user":"Deactivated user","User Management",u.username,`Status changed to ${status}`);
      return json(200,{success:true});
    }
    return json(405,{error:"Method not allowed"});
  }catch(e){return json(500,{error:e.message||"User operation failed"});}
};
