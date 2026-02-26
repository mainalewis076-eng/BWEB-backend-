
const express=require("express"),cors=require("cors"),axios=require("axios"),{createClient}=require("@supabase/supabase-js");
const app=express();app.use(cors());app.use(express.json());
const sb=createClient("https://qqnhqtnkkzxnzcclzzvt.supabase.co","sb_publishable_LmDKIprQByu0Obl7kG6R7Q_-ZsOrElK");
const C=0.10,S=0.90;
const API=process.env.BACKEND_URL||"https://bweb-backend-production.up.railway.app";
const WEB=process.env.WEBSITE_URL||"https://yourdomain.com";
const PK=process.env.PESAPAL_KEY||"bERTg3ACJMYAo8TQvGTcDyy+2eXbF0b2";
const PS=process.env.PESAPAL_SECRET||"jRa27BcmlflF61R+x3ngQ1e0dNg=";
app.get("/",(q,r)=>r.json({status:"BWEB LIVE!"}));
app.post("/place-order",async(q,r)=>{
try{
const b=q.body;
const t=parseFloat(b.unit_price)*parseInt
const cm=+(tC).toFixed(2);
const sa=+(t*S).toFixed(2);
const{data:o,error}=await sb.from("orders").insert([{buyer_name:b.buyer_name,buyer_email:b.buyer_email,buyer_phone:b.buyer_phone,seller_id:b.seller_id,seller_name:b.seller_name,product_id:b.product_id,product_name:b.product_name,product_emoji:b.product_emoji||"📦",quantity:parseInt(b.quantity),unit_price:parseFloat(b.unit_price),total_amount:t,commission:cm,seller_amount:sa,payment_method:b.payment_method,status:"pending",payment_status:"unpaid",delivery_confirmed:false,seller_paid:false}]).select().single();
if(error)throw error;
await sb.from("commissions").insert([{order_id:o.id,total_amount:t,commission:cm,seller_amount:sa,status:"pending"}]);
return r.json({success:true,order_id:o.id,total_amount:t,commission:cm,seller_amount:sa});
}catch(e){return r.status(500).json({error:"Failed"})}
});
app.post("/pay/pesapal",async(q,r)=>{
try{
const{order_id}=q.body;
const{data:o}=await sb.from("orders").select("*").eq("id",order_id).single();
if(!o)return r.status(404).json({error:"Not found"});
const auth=await axios.post("https://cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken",{consumer_key:PK,consumer_secret:PS},{headers:{"Content-Type":"application/json",Accept:"application/json"}});
const tk=auth.data.token;
if(!tk)return r.status(500).json({error:"Auth failed"});
const ipn=await axios.post("https://cybqa.pesapal.com/pesapalv3/api/URLSetup/RegisterIPN",{url:API+"/webhook/pesapal",ipn_notification_type:"POST"},{headers:{Authorization:"Bearer "+tk,"Content-Type":"application/json"}});
const sub=await axios.post("https://cybqa.pesapal.com/pesapalv3/api/Transactions/SubmitOrderRequest",{id:order_id,currency:"USD",amount:o.total_amount,description:"BWEB:"+o.product_name,callback_url:API+"/payment-callback?order_id="+order_id,notification_id:ipn.data.ipn_id,billing_address:{email_address:o.buyer_email,phone_number:o.buyer_phone||"",first_name:o.buyer_name||"Buyer",last_name:""}},{headers:{Authorization:"Bearer "+tk,"Content-Type":"application/json"}});
if(!sub.data.redirect_url)return r.status(500).json({error:"Failed"});
return r.json({success:true,payment_url:sub.data.redirect_url});
}catch(e){return r.status(500).json({error:"PesaPal failed"})}
});
app.post("/webhook/pesapal",async(q,r)=>{
try{
const id=q.body.OrderMerchantReference;
if(id){
const{data:o}=await sb.from("orders").select("*").eq("id",id).single();
if(o&&o.payment_status!=="paid"){
await sb.from("orders").update({payment_status:"paid",status:"paid"}).eq("id",id);
await sb.from("notifications").insert([{user_id:o.seller_id,type:"new_order",title:"New Order!",message:o.buyer_name+" ordered "+o.product_name,order_id:id,read:false}]);
}}
r.send("OK");
}catch(e){r.send("Error")}
});
app.get("/payment-callback",async(q,r)=>{
const id=q.query.order_id;
const{data:o}=await sb.from("orders").select("payment_status").eq("id",id).single();
r.redirect(o&&o.payment_status==="paid"?WEB+"?success=1":WEB+"?failed=1");
});
app.post("/confirm-delivery",async(q,r)=>{
try{
const{order_id,buyer_email}=q.body;
const{data:o}=await sb.from("orders").select("*").eq("id",order_id).single();
if(!o)return r.status(404).json({error:"Not found"});
if(o.delivery_confirmed)return r.status(400).json({error:"Already done"});
await sb.from("orders").update({delivery_confirmed:true,status:"delivered"}).eq("id",order_id);
await sb.from("payouts").insert([{order_id,seller_id:o.seller_id,seller_name:o.seller_name,product_name:o.product_name,amount:o.seller_amount,commission:o.commission,total_order:o.total_amount,status:"pending"}]);
await sb.from("notifications").insert([{user_id:o.seller_id,type:"payout",title:"Payout Coming!",message:"$"+o.seller_amount+" coming for "+o.product_name,order_id,read:false}]);
return r.json({success:true,seller_payout:o.seller_amount,bweb_commission:o.commission});
}catch(e){return r.status(500).json({error:"Failed"})}
});
app.get("/orders/buyer",async(q,r)=>{
const{data:o}=await sb.from("orders").select("*").eq("buyer_email",q.query.email).order("created_at",{ascending:false});
r.json({success:true,orders:o||[]});
});
app.get("/orders/seller",async(q,r)=>{
const{data:o}=await sb.from("orders").select("*").eq("seller_id",q.query.seller_id).order("created_at",{ascending:false});
const orders=o||[];
r.json({success:true,orders,stats:{total_orders:orders.length,total_revenue:orders.filter(function(x){return x.delivery_confirmed}).reduce(function(s,x){return s+x.seller_amount},0)}});
});
app.post("/ai/assistant",async(q,r)=>{
try{
const{message,role,location}=q.body;
const{data:p}=await sb.from("products").select("name,price,country,county,seller_name,emoji").limit(50);
const list=(p||[]).map(function(x){return x.emoji+x.name+" $"+x.price+"|"+x.seller_name+"|"+x.county+","+x.country}).join("\n");
const ai=await axios.post("https://api.anthropic.com/v1/messages",{model:"claude-3-haiku-20240307",max_tokens:500,system:"You are BWEB AI helping "+( role||"user")+". Location:"+(location||"?")+". Products:\n"+( list||"None"),messages:[{role:"user",content:message}]},{headers:{"x-api-key":process.env.ANTHROPIC_KEY,"anthropic-version":"2023-06-01","Content-Type":"application/json"}});
r.json({success:true,reply:ai.data.content[0].text||"Try again!"});
}catch(e){r.status(500).json({reply:"AI unavailable!"})}
});
app.get("/notifications",async(q,r)=>{
const{data:n}=await sb.from("notifications").select("*").eq("user_id",q.query.user_id).order("created_at",{ascending:false}).limit(30);
r.json({success:true,notifications:n||[]});
});
const PORT=process.env.PORT||3000;
app.listen(PORT,function(){console.log("BWEB running on port "+PORT)});

  
