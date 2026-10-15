const initial={food:6,water:7,medkits:2,battery:4,ah:82,as:68,mh:91,ms:76,threat:0,steps:0};
let state={...initial},minute=0,currentLocation="start";
let travelTimer=null,toastTimer=null;
let hasCrossedGrocery=false,encounterUsed=false;
let blockedDestination="safe",pendingDestination=null;
const $=id=>document.getElementById(id);

const locations={
 start:{left:10,top:89,label:"YOU ARE HERE"},
 grocery:{left:30,top:67,label:"GROCERY STORE"},
 safe:{left:48,top:48,label:"SAFE HOUSE"},
 beacon:{left:86,top:12,label:"FINAL BEACON"},
 detour:{left:31,top:83,label:"SOUTHERN DETOUR"}
};

function notify(message){
 $("toast").textContent=message;
 $("toast").style.display="block";
 clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>$("toast").style.display="none",2800);
}

function logEvent(message){
 const el=document.createElement("div");
 el.className="event";
 const dot=document.createElement("i");
 const span=document.createElement("span");
 span.textContent=$("clock").textContent+" — "+message;
 el.append(dot,span);
 $("events").prepend(el);
 while($("events").children.length>5)$("events").lastChild.remove();
}

function render(){
 for(const k of ["food","water","medkits","battery"])$(k).textContent=state[k];
 for(const k of ["ah","as","mh","ms"]){
  $(k).textContent=state[k]+"%";
  $(k+"bar").style.width=state[k]+"%";
 }
 $("weight").textContent=(state.food+state.water+state.medkits+state.battery)+" / 30 units";
 $("northThreat").textContent=state.threat%2?"Horde moving east · Critical risk":"Horde activity · High risk";
 $("factoryThreat").textContent=state.threat%2?"Temporary lull · Moderate risk":"Unstable · Moderate risk";
}

function changeSupply(key,delta){
 if(state[key]+delta<0||state[key]+delta>15){notify("Supply limit reached.");return}
 state[key]+=delta;render();logEvent(key+" inventory updated.");
}

function updateClock(){
 const total=720+minute;
 $("clock").textContent=String(Math.floor(total/60)%24).padStart(2,"0")+":"+String(total%60).padStart(2,"0");
}

function showTravelStops(show,destination){
  $("detourStopPin").style.display=show?"grid":"none";
  $("detourStopLabel").style.display=show?"block":"none";
  ["groceryPin","safePin","beaconPin"].forEach(id=>$(id).classList.remove("target-stop"));
  if(show && destination){
    const pinId={grocery:"groceryPin",safe:"safePin",beacon:"beaconPin"}[destination];
    if(pinId)$(pinId).classList.add("target-stop");
  }
}

function showZombies(show){
 ["zombie1","zombie2","zombie3"].forEach(id=>{
  $(id).style.display=show?"grid":"none";
 });
 $("zombieLabel").style.display=show?"block":"none";
}

function normalChoices(){
 $("decision").innerHTML=`
  <option value="grocery">Travel to Grocery Store</option>
  <option value="safe">Travel to Safe House</option>
  <option value="direct">Take direct route to Final Beacon</option>
  <option value="detour">Take longer detour</option>
  <option value="medkit">Use a medkit</option>`;
 $("modalTitle").textContent="Choose your next move";
 $("modalDescription").textContent="Select a plan for Aarav and Mira.";
}

function closeDecision(){$("modal").style.display="none"}

function openDecision(){
 $("modal").style.display="grid";
 if(currentLocation==="blocked"){
  $("modalTitle").textContent="🧟 ZOMBIE AMBUSH";
  $("modalDescription").textContent="The road is blocked. Choose a detour to continue.";
 }
}

/* Travel animation to a destination. */
function moveTo(destination,message,callback){
 if(travelTimer)clearTimeout(travelTimer);
 const marker=$("survivorMarker"),label=$("survivorLabel");
 const target=locations[destination];
 if(destination==="detour"){
  // Keep the southern detour stop visible while the survivors travel to it.
  showTravelStops(true,pendingDestination);
 }else{
  showTravelStops(false,null);
 }
 const pinId={grocery:"groceryPin",safe:"safePin",beacon:"beaconPin"}[destination];
 if(pinId)$(pinId).classList.add("target-stop");
 marker.classList.add("moving");
 label.textContent="TRAVELLING…";
 $("mapCaption").textContent="Aarav and Mira are travelling along the selected route.";
 void marker.offsetWidth;
 requestAnimationFrame(()=>{
  marker.style.left=target.left+"%";
  marker.style.top=target.top+"%";
  label.style.left=Math.min(target.left+2,82)+"%";
  label.style.top=Math.max(target.top-2,3)+"%";
 });
 travelTimer=setTimeout(()=>{
  marker.classList.remove("moving");
  currentLocation=destination;
  ["groceryPin","safePin","beaconPin"].forEach(id=>$(id).classList.remove("target-stop"));
  label.textContent=target.label;
  $("mapCaption").textContent=message||"Arrived at "+target.label+".";
  logEvent("Arrived at "+target.label.toLowerCase()+".");
  travelTimer=null;
  if(callback)callback();
 },1800);
}

/*
 ZOMBIE ENCOUNTER:
 Triggered when travelling from YOU ARE HERE to Safe House,
 or between Grocery Store and Safe House.
 Three actual zombie markers appear halfway along the road.
 The survivors stop and must use the alternate southern path.
*/
function triggerRoadEncounter(destination){
 pendingDestination=destination;
 blockedDestination=destination;
 const marker=$("survivorMarker"),label=$("survivorLabel");
 marker.classList.add("moving");
 label.textContent="TRAVELLING…";
 $("mapCaption").textContent="Aarav and Mira are moving along the road…";

 requestAnimationFrame(()=>{
  marker.style.left="39%";
  marker.style.top="57%";
  label.style.left="41%";
  label.style.top="53%";
 });

 travelTimer=setTimeout(()=>{
  travelTimer=null;
  marker.classList.remove("moving");
  currentLocation="blocked";
  label.textContent="PATH BLOCKED";
  showZombies(true);

  $("mapCaption").textContent="🚨 THREE ZOMBIES ARE PHYSICALLY BLOCKING THE ROAD. Aarav and Mira must take another path.";
  $("modalTitle").textContent="🧟 ZOMBIE AMBUSH";
  $("modalDescription").textContent="Three zombies are standing directly on the road. The direct route is blocked. Choose the southern detour or risk the alley.";

  $("decision").innerHTML=`
   <option value="detourSafe">🌿 Southern forest detour — safer, costs supplies</option>
   <option value="detourRisky">⚠ Abandoned alley — risky, possible injury</option>
   <option value="retreat">↩ Retreat to the last checkpoint</option>`;

  logEvent("Three zombies appeared on the road and blocked the direct route.");
  notify("ZOMBIES ON THE ROAD! Direct travel has stopped.");
  $("modal").style.display="grid";
 },1900);
}

function applyDecision(){
 const d=$("decision").value;
 let message="";

 /* While the route is blocked, only the escape options can be selected. */
 if(currentLocation==="blocked"){
  if(d==="retreat"&&hasCrossedGrocery){
   notify("You have crossed the Grocery Store checkpoint. You cannot return to YOU ARE HERE. Choose a detour.");
   return;
  }
  closeDecision();

  if(d==="detourSafe"){
   showZombies(false);
   state.as=Math.max(0,state.as-8);
   state.ms=Math.max(0,state.ms-7);
   state.food=Math.max(0,state.food-1);
   state.water=Math.max(0,state.water-1);

   $("routePath").style.stroke="var(--amber)";
   $("detourPath").style.stroke="var(--green)";
   logEvent("Selected the southern detour to avoid the zombie group.");
   notify("Taking the alternate southern route.");

   moveTo("detour","Aarav and Mira bypass the zombies using the southern forest detour.",()=>{
    moveTo(pendingDestination,"Aarav and Mira rejoin the route and reach "+locations[pendingDestination].label+".",()=>{
     if(currentLocation==="grocery")hasCrossedGrocery=true;
    });
   });
   message="The safer detour avoided the zombies. Food, water and stamina were consumed.";
  }

  if(d==="detourRisky"){
   showZombies(false);
   state.as=Math.max(0,state.as-14);
   state.ms=Math.max(0,state.ms-12);
   if(state.threat%2){
    state.ah=Math.max(0,state.ah-12);
    state.mh=Math.max(0,state.mh-9);
   }
   logEvent("Escaped through the dangerous alley.");
   notify("Risky alley selected.");

   moveTo("detour","Aarav and Mira escape through the abandoned alley.",()=>{
    moveTo(pendingDestination,"They reach "+locations[pendingDestination].label+" after the risky detour.",()=>{
     if(currentLocation==="grocery")hasCrossedGrocery=true;
    });
   });
   message="They escaped through the alley but lost stamina and may have been injured.";
  }

  if(d==="retreat"){
   showZombies(false);
   const destination=blockedDestination==="safe"?"start":"grocery";
   state.as=Math.max(0,state.as-3);
   state.ms=Math.max(0,state.ms-3);
   logEvent("Retreated to the last checkpoint.");
   moveTo(destination,"Aarav and Mira retreated to "+locations[destination].label+".");
   message="They retreated to the previous checkpoint.";
  }

  normalChoices();
  updateClock();
  render();
  if(message)logEvent(message);
  return;
 }

 /* Once Grocery Store has been crossed, the starting point is locked. */
 if(d==="start"&&hasCrossedGrocery){
  notify("The starting point is no longer accessible after crossing the Grocery Store.");
  return;
 }

 state.steps++;
 minute+=20;

 if(d==="grocery"){
  if(currentLocation==="safe"&&!encounterUsed){
   encounterUsed=true;minute-=10;updateClock();render();closeDecision();
   triggerRoadEncounter("grocery");return;
  }
  moveTo("grocery","Aarav and Mira reached the Grocery Store.",()=>{
   hasCrossedGrocery=true;
   logEvent("Grocery Store checkpoint crossed. Returning to the starting point is no longer possible.");
  });
  state.food=Math.min(15,state.food+3);
  state.as=Math.max(0,state.as-12);
  state.ms=Math.max(0,state.ms-8);
  message="Collected 3 food units at the Grocery Store.";
 }

 if(d==="safe"){
  if((currentLocation==="start"||currentLocation==="grocery")&&!encounterUsed){
   encounterUsed=true;minute-=10;updateClock();render();closeDecision();
   triggerRoadEncounter("safe");return;
  }
  moveTo("safe","Aarav and Mira reached the Safe House.");
  state.as=Math.min(100,state.as+18);
  state.ms=Math.min(100,state.ms+18);
  state.food=Math.max(0,state.food-1);
  state.water=Math.max(0,state.water-1);
  message="Rested at the Safe House and recovered stamina.";
 }

 if(d==="direct"){
  moveTo("beacon","Aarav and Mira reached the Final Beacon.");
  state.as=Math.max(0,state.as-8);
  if(state.threat%2){
   state.ah=Math.max(0,state.ah-18);
   state.mh=Math.max(0,state.mh-12);
   message="The direct route was dangerous. Both survivors took damage.";
  }else message="They took the direct route to the Final Beacon.";
 }

 if(d==="detour"){
  moveTo("detour","Aarav and Mira took the southern detour.");
  state.food=Math.max(0,state.food-1);
  state.water=Math.max(0,state.water-1);
  state.as=Math.max(0,state.as-7);
  state.ms=Math.max(0,state.ms-7);
  message="Completed the longer detour.";
 }

 if(d==="medkit"){
  if(state.medkits>0){
   state.medkits--;
   state.ah=Math.min(100,state.ah+15);
   state.mh=Math.min(100,state.mh+15);
   message="Both survivors recovered health using a medkit.";
  }else message="No medkits remain.";
 }

 closeDecision();
 updateClock();
 render();
 if(message){logEvent(message);notify(message);}
}

function simulateThreat(){
 state.threat++;
 minute+=15;
 state.as=Math.max(0,state.as-3);
 state.ms=Math.max(0,state.ms-2);
 $("mapCaption").textContent=state.threat%2
  ?"ALERT: Horde movement detected. Consider a safer route."
  :"Threat scan updated. The old factory remains uncertain.";
 logEvent("Threat intelligence updated.");
 updateClock();
 render();
 notify("Threat intelligence updated.");
}

function resetDemo(){
 if(travelTimer)clearTimeout(travelTimer);
 travelTimer=null;
 state={...initial};
 minute=0;
 currentLocation="start";
 hasCrossedGrocery=false;
 encounterUsed=false;
 pendingDestination=null;
 blockedDestination="safe";

 showZombies(false);
 normalChoices();
 closeDecision();

 $("survivorMarker").classList.remove("moving");
 $("survivorMarker").style.left="10%";
 $("survivorMarker").style.top="89%";
 $("survivorLabel").style.left="12%";
 $("survivorLabel").style.top="87%";
 $("survivorLabel").textContent="YOU ARE HERE";

 $("routePath").style.stroke="var(--green)";
 $("detourPath").style.stroke="var(--amber)";
 $("events").innerHTML='<div class="event"><i></i><span>12:00 — Simulation reset. Beacon signal acquired.</span></div>';
 $("mapCaption").textContent="Fictional city map · Routes and threats are simulated.";
 updateClock();
 render();
 notify("Reset complete. Travel to the Safe House to trigger the zombie ambush.");
}

render();

// Backend API helpers (Node.js server must be running at http://localhost:3000).
// These helpers can be called from UI handlers when you want server-side state.
const BACKEND_API = "/api";

async function backendRequest(path, method = "GET", payload = undefined) {
  const response = await fetch(`${BACKEND_API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Backend request failed");
  return result;
}

async function getBackendState() {
  return (await backendRequest("/state")).state;
}

async function sendBackendDecision(action) {
  return backendRequest("/decision", "POST", { action });
}

async function sendBackendThreatUpdate() {
  return backendRequest("/threats", "POST");
}

async function sendBackendSupplyChange(item, delta) {
  return backendRequest("/supplies", "POST", { item, delta });
}

async function resetBackendState() {
  return backendRequest("/reset", "POST");
}

// The frontend currently preserves its original local demo behavior.
// To make server state authoritative, wire the existing handlers
// (applyDecision, simulateThreat, changeSupply, resetDemo) to these helpers.
