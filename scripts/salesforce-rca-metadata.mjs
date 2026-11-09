#!/usr/bin/env node
// Metadata SOAP retrieve only. This module has no deploy, update, or delete operation.
import {writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {safeLoginUrl} from "./salesforce-rca.mjs";

const BASE="https://hdbsf-dev-ed.develop.my.salesforce.com";
const ORG="00Dfj00000eVCOVEA4";
const OLD_USER="005fj00000SF7fRAAT";
const NS="http://soap.sforce.com/2006/04/metadata";
const xml=x=>String(x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const tag=(body,key)=>new RegExp("<(?:[A-Za-z0-9_.-]+:)?"+key+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?"+key+">").exec(body)?.[1]??null;

export function validateMetadataRequest(req) {
  if (!req || req.action!=="metadata_retrieve" || Object.keys(req).some(k=>!["action","types"].includes(k))) throw Error("Invalid metadata action");
  if (!Array.isArray(req.types) || req.types.length<1 || req.types.length>5) throw Error("Require 1..5 metadata types");
  let count=0;
  for (const type of req.types) {
    if (!type || Object.keys(type).some(k=>!["name","members"].includes(k)) ||
        typeof type.name!=="string" || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(type.name) ||
        !Array.isArray(type.members) || !type.members.length || type.members.length>20) throw Error("Metadata type invalid");
    for (const member of type.members) {
      if (typeof member!=="string" || member.length>255 ||
          !(member==="*" || /^[A-Za-z0-9_.$ -]+$/.test(member))) throw Error("Metadata member invalid");
    }
    count+=type.members.length;
  }
  if (count>40) throw Error("Too many metadata members");
  return req;
}

function envelope(token,action) {
  return '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:m="'+NS+'">'+
    '<s:Header><m:SessionHeader><m:sessionId>'+xml(token)+'</m:sessionId></m:SessionHeader></s:Header>'+
    '<s:Body>'+action+'</s:Body></s:Envelope>';
}
async function bounded(response) {
  if (Number(response.headers.get("content-length")||0)>12000000) throw Error("SOAP response too large");
  if (!response.body) throw Error("Missing SOAP body");
  const chunks=[];let count=0;
  for await (const part of response.body) {
    count+=part.length;
    if(count>12000000)throw Error("SOAP response >12MB");
    chunks.push(part);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function soap(base,token,method,body) {
  const response=await fetch(base+"/services/Soap/m/68.0",{method:"POST",redirect:"error",
    headers:{"content-type":"text/xml; charset=utf-8",SOAPAction:method},
    body:envelope(token,body),signal:AbortSignal.timeout(45000)});
  const content=await bounded(response);
  if(!response.ok||/<(?:[A-Za-z0-9_.-]+:)?Fault>/.test(content))
    throw Error("SOAP "+method+" HTTP "+response.status+" "+(tag(content,"faultstring")||"API fault").slice(0,300));
  return content;
}
async function login(){
  const user=process.env.SF_META_USER_ID||"";
  if(!/^005[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/.test(user)||user.slice(0,15)===OLD_USER.slice(0,15))
    throw Error("SF_META_USER_ID must identify a different dedicated metadata user");
  const origin=safeLoginUrl(process.env.SF_META_LOGIN_URL||"");
  if(!process.env.SF_META_CLIENT_ID||!process.env.SF_META_CLIENT_SECRET)throw Error("Metadata credentials not configured");
  const response=await fetch(origin+"/services/oauth2/token",{method:"POST",redirect:"error",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"client_credentials",client_id:process.env.SF_META_CLIENT_ID,client_secret:process.env.SF_META_CLIENT_SECRET}),
    signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error("Metadata OAuth HTTP "+response.status);
  const auth=await response.json();
  if(!auth.access_token||safeLoginUrl(auth.instance_url||"")!==BASE)throw Error("Unexpected metadata OAuth instance");
  const identity=new URL(auth.id||"");
  const parts=identity.pathname.split("/").filter(Boolean);
  if(identity.protocol!=="https:"||!["login.salesforce.com","test.salesforce.com",new URL(BASE).hostname].includes(identity.hostname)||
    parts.length!==3||parts[0]!=="id"||parts[1].slice(0,15)!==ORG.slice(0,15)||parts[2].slice(0,15)!==user.slice(0,15))
    throw Error("Unexpected Metadata OAuth identity");
  return {base:BASE,token:auth.access_token};
}

export async function retrieveMetadata(req,outputDir) {
  validateMetadataRequest(req);
  const auth=await login();
  const types=req.types.map(t=>'<m:types>'+t.members.map(x=>'<m:members>'+xml(x)+'</m:members>').join("")+
    '<m:name>'+xml(t.name)+'</m:name></m:types>').join("");
  const retrieve='<m:retrieve><m:retrieveRequest><m:apiVersion>68.0</m:apiVersion><m:singlePackage>true</m:singlePackage>'+
    '<m:unpackaged>'+types+'<m:version>68.0</m:version></m:unpackaged></m:retrieveRequest></m:retrieve>';
  const init=await soap(auth.base,auth.token,"retrieve",retrieve);
  const id=tag(init,"id");
  if(!id||!/^[A-Za-z0-9]{15,18}$/.test(id))throw Error("Metadata retrieve ID invalid");
  let finished=false;
  for(let i=0;i<15;i++){
    if(i)await new Promise(resolve=>setTimeout(resolve,2500));
    const check='<m:checkRetrieveStatus><m:asyncProcessId>'+id+'</m:asyncProcessId><m:includeZip>false</m:includeZip></m:checkRetrieveStatus>';
    const status=await soap(auth.base,auth.token,"checkRetrieveStatus",check);
    if(tag(status,"done")==="true"){
      if(tag(status,"status")!=="Succeeded")throw Error("Metadata retrieve status "+tag(status,"status"));
      finished=true;break;
    }
  }
  if(!finished)throw Error("Metadata retrieve timeout");
  const checkZip='<m:checkRetrieveStatus><m:asyncProcessId>'+id+'</m:asyncProcessId><m:includeZip>true</m:includeZip></m:checkRetrieveStatus>';
  const completed=await soap(auth.base,auth.token,"checkRetrieveStatus",checkZip);
  const b64=tag(completed,"zipFile");
  if(!b64||b64.length>6800000||!/^[A-Za-z0-9+/=\s]+$/.test(b64))throw Error("Metadata ZIP absent or exceeds 5MB");
  const zip=Buffer.from(b64.replace(/\s/g,""),"base64");
  if(zip.length>5000000||zip.subarray(0,2).toString()!=="PK")throw Error("Metadata ZIP invalid");
  const file=join(outputDir,"sf-metadata-retrieve.zip");
  await writeFile(file,zip,{mode:0o600});
  const entries=execFileSync("unzip",["-Z1",file],{encoding:"utf8",maxBuffer:1000000}).trim().split("\n").filter(Boolean);
  if(entries.length>300||entries.some(x=>x.startsWith("/")||x.split("/").includes("..")||x.includes("\\")))throw Error("ZIP entry unsafe");
  const hash=createHash("sha256").update(zip).digest("hex");
  const header=["## Salesforce Metadata SOAP — LIVE Retrieve Evidence","","- Status: **Succeeded**","- Mode: **LIVE**",
    "- Operations: retrieve / checkRetrieveStatus (no deploy)","- ZIP SHA-256: "+hash,"- ZIP bytes: "+zip.length,
    "- Files: "+entries.length,"- Types: "+req.types.map(t=>t.name).join(", "),"",""].join("\n");
  let text=header,shown=0;
  for(const entry of entries.filter(x=>/\.(xml|flow|object|permissionset|profile|cls|trigger|page|json)$/.test(x))){
    let buf;
    try { buf=execFileSync("unzip",["-p",file,entry],{maxBuffer:51000,stdio:["ignore","pipe","ignore"]}); }
    catch { continue; } // large/binary entries remain in the ZIP artifact
    const section="### "+entry+"\n\n"+String.fromCharCode(96).repeat(3)+"xml\n"+buf.toString("utf8")+
      "\n"+String.fromCharCode(96).repeat(3)+"\n\n";
    if(Buffer.byteLength(text+section)>48000)break;
    text+=section;shown++;
  }
  text+="\nIncluded "+shown+" of "+entries.length+" ZIP entries inline. Complete archive retained as short-lived GitHub Actions artifact.\n";
  await writeFile(join(outputDir,"sf-raw-evidence.md"),text,{mode:0o600});
  return {zipBytes:zip.length,files:entries.length,inlined:shown};
}
