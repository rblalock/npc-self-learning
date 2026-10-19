import { Arena, WIDTH, HEIGHT, WALLS, LABELS, LOCK_WINDOW, type Point } from './sim';

const terrain = new Image();
terrain.src = `${import.meta.env.BASE_URL}art/relay-field.webp`;
const ink = '#454b3b', blue = '#245d78', red = '#a24132', violet = '#665381';

/** Art is presentation only. Geometry, perception and all evidence remain in Arena. */
export function drawBattlefield(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, arena: Arena | undefined, pointer: Point) {
  const scale = canvas.width / WIDTH;
  const compact = canvas.clientWidth < 520;
  const labelScale = Math.max(1, WIDTH / Math.max(1,canvas.clientWidth));
  // Keep essential annotations at >=10 CSS px without changing world geometry.
  const label = (text:string,x:number,y:number,color:string,align:CanvasTextAlign='center') => {
    ctx.save();ctx.font=`600 ${10*labelScale}px "Source Sans 3",sans-serif`;ctx.textAlign=align;
    const width=ctx.measureText(text).width,pad=3*labelScale;
    const left=align==='right'?x-width:align==='left'?x:x-width/2;
    ctx.fillStyle='#f4ecd5e8';ctx.fillRect(left-pad,y-10*labelScale,width+pad*2,13*labelScale);
    ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();
  };
  ctx.setTransform(scale,0,0,scale,0,0);
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle='#e8e0c8';ctx.fillRect(0,0,WIDTH,HEIGHT);
  if(terrain.complete && terrain.naturalWidth) ctx.drawImage(terrain,0,0,WIDTH,HEIGHT);
  const line = (a:Point,b:Point) => {ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();};
  const circle = (x:number,y:number,r:number,fill?:string) => {ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}else ctx.stroke();};
  // Map registration and scale describe space; there is no dashboard grid.
  ctx.strokeStyle='#70755b65';ctx.lineWidth=.8;
  for(let x=80;x<WIDTH;x+=80){line({x,y:0},{x,y:5});line({x,y:HEIGHT-5},{x,y:HEIGHT});}
  for(let y=80;y<HEIGHT;y+=80){line({x:0,y},{x:5,y});line({x:WIDTH-5,y},{x:WIDTH,y});}
  ctx.font='9px "Source Sans 3",sans-serif';ctx.fillText('SURVEY  /  TACTICAL AIR',35,HEIGHT-11);
  // A cartographic north mark and scale, kept away from live targets.
  ctx.save();ctx.translate(857,520);ctx.strokeStyle=ink;ctx.lineWidth=1;
  line({x:0,y:0},{x:0,y:-31});line({x:0,y:-31},{x:-5,y:-20});line({x:0,y:-31},{x:5,y:-20});
  ctx.font='13px Kalam,cursive';ctx.fillStyle=ink;ctx.fillText('N',-4,-37);ctx.restore();
  ctx.strokeStyle=ink;line({x:797,y:565},{x:867,y:565});line({x:797,y:561},{x:797,y:569});line({x:867,y:561},{x:867,y:569});
  ctx.font='9px "Source Sans 3",sans-serif';ctx.fillText('70 units',812,581);
  // Fortification symbols exactly follow the collision rectangles, including all corners.
  for(const [index,w] of WALLS.entries()) {
    ctx.fillStyle='#b0aa85';ctx.fillRect(w.x,w.y,w.w,w.h);
    ctx.save();ctx.beginPath();ctx.rect(w.x,w.y,w.w,w.h);ctx.clip();
    ctx.strokeStyle='#787c5d80';ctx.lineWidth=.7;
    for(let d=-w.h;d<w.w;d+=7)line({x:w.x+d,y:w.y+w.h},{x:w.x+d+w.h,y:w.y});
    ctx.restore();ctx.strokeStyle='#444d3b';ctx.lineWidth=1.6;ctx.strokeRect(w.x,w.y,w.w,w.h);
    ctx.strokeStyle='#e8dfc0';ctx.lineWidth=3;line({x:w.x+3,y:w.y+3},{x:w.x+w.w-3,y:w.y+3});
    ctx.strokeStyle='#555d44';ctx.lineWidth=1;ctx.strokeRect(w.x+6,w.y+7,w.w-12,w.h-14);
    if(!compact){
      ctx.fillStyle='#e8e0c7';ctx.fillRect(w.x+10,w.y+w.h/2-9,w.w-20,19);
      ctx.font='12px Kalam,cursive';ctx.textAlign='center';ctx.fillStyle=ink;ctx.fillText(`cover ${index+1}`,w.x+w.w/2,w.y+w.h/2+5);ctx.textAlign='left';
    }
  }
  if(!arena) return;
  // Faint route marks are tactical annotations, not collision or hidden-world knowledge.
  for(const e of arena.enemies) if(e.hp>0 && e.path.length) {
    ctx.strokeStyle='#a241322e';ctx.lineWidth=1;ctx.setLineDash([4,6]);let last:Point=e;
    for(const p of e.path.slice(0,4)){line(last,p);last=p;}ctx.setLineDash([]);
  }
  for(const e of arena.enemies) if(e.hp>0 && e.windup>0) {
    const locked=e.windup<=LOCK_WINDOW;
    ctx.strokeStyle=locked?'#8d2d24':'#ab6950';ctx.lineWidth=locked?2.5:1;ctx.setLineDash(locked?[]:[5,5]);line(e,e.target);ctx.setLineDash([]);
    circle(e.target.x,e.target.y,locked?10:8+e.windup*13);
    line({x:e.target.x-14,y:e.target.y},{x:e.target.x+14,y:e.target.y});line({x:e.target.x,y:e.target.y-14},{x:e.target.x,y:e.target.y+14});
    label(locked?'DODGE':'AIMING',Math.min(WIDTH-95*labelScale,e.x+25),e.y-10,red,'left');
  }
  const scout=arena.scout;
  if(scout){
    ctx.fillStyle='#e0d8df';ctx.fillRect(887,274,25,52);ctx.strokeStyle=violet;ctx.lineWidth=1.5;ctx.strokeRect(887,274,25,52);
    line({x:899,y:313},{x:899,y:286});line({x:899,y:286},{x:891,y:308});line({x:899,y:286},{x:907,y:308});circle(899,284,3,violet);
    label('Relay',907,265,violet,'right');
    if(scout.hp>0 && scout.status!=='delivered'){
      ctx.setLineDash([2,5]);ctx.strokeStyle='#66538165';line(scout,{x:897,y:300});ctx.setLineDash([]);
      ctx.fillStyle='#eee4cb';circle(scout.x,scout.y,15,'#eee4cb');ctx.strokeStyle=violet;ctx.lineWidth=2;circle(scout.x,scout.y,13);
      ctx.strokeRect(scout.x-7,scout.y-5,14,10);line({x:scout.x-7,y:scout.y-5},{x:scout.x,y:scout.y+1});line({x:scout.x+7,y:scout.y-5},{x:scout.x,y:scout.y+1});
      label(scout.status==='watching'?`Scout · ${Math.max(0,8-arena.time).toFixed(0)}s`:'Report leaving',Math.min(WIDTH-55*labelScale,Math.max(55*labelScale,scout.x)),scout.y-23,violet);
      ctx.fillRect(scout.x-13,scout.y+20,26*scout.hp/36,3);
    }
  }
  for(const b of arena.bullets){ctx.strokeStyle=b.enemy===null?blue:red;ctx.lineWidth=b.enemy===null?2:3;line(b,{x:b.x-b.vx*.028,y:b.y-b.vy*.028});circle(b.x,b.y,b.enemy===null?2:3,b.enemy===null?blue:red);}
  for(const e of arena.enemies){
    ctx.save();ctx.translate(e.x,e.y);
    if(e.hp<=0){ctx.strokeStyle='#706e5770';ctx.lineWidth=1.2;line({x:-7,y:-7},{x:7,y:7});line({x:-7,y:7},{x:7,y:-7});ctx.restore();continue;}
    // Distinct military map counters carry role identity even without color.
    ctx.fillStyle='#f2dfc2';ctx.strokeStyle=red;ctx.lineWidth=2;ctx.beginPath();
    if(e.role==='vanguard')ctx.rect(-16,-12,32,24);
    else if(e.role==='flanker'){ctx.moveTo(0,-17);ctx.lineTo(17,0);ctx.lineTo(0,17);ctx.lineTo(-17,0);ctx.closePath();}
    else {ctx.moveTo(-17,12);ctx.lineTo(0,-17);ctx.lineTo(17,12);ctx.closePath();}
    ctx.fill();ctx.stroke();
    if(e.role==='vanguard'){ctx.beginPath();ctx.ellipse(0,0,8,4,0,0,Math.PI*2);ctx.stroke();}
    else if(e.role==='flanker'){line({x:-6,y:-6},{x:6,y:6});line({x:-6,y:6},{x:6,y:-6});}
    else {circle(0,1,4);line({x:0,y:-7},{x:0,y:8});}
    ctx.fillStyle='#a59570';ctx.fillRect(-17,23,34,3);ctx.fillStyle=red;ctx.fillRect(-17,23,34*e.hp/72,3);
    ctx.restore();
    const roleName=e.role[0].toUpperCase()+e.role.slice(1);
    ctx.font=`600 ${10*labelScale}px "Source Sans 3",sans-serif`;
    const roleWidth=ctx.measureText(roleName).width;
    ctx.font='12px Kalam,cursive';
    const textWidth=Math.max(roleWidth,compact?0:ctx.measureText(LABELS[e.tactic]).width);
    const pad=3*labelScale,boxWidth=textWidth+2*pad,boxHeight=13*labelScale+(compact?0:17);
    // Annotations follow counters; prefer nearby space clear of physical cover and the HUD.
    const gap=21+pad;
    const candidates=[
      {x:e.x+gap,y:e.y-6*labelScale},
      {x:e.x-gap-boxWidth,y:e.y-6*labelScale},
      {x:e.x-boxWidth/2,y:e.y-gap-boxHeight},
      {x:e.x-boxWidth/2,y:e.y+28},
    ].map(p=>({x:Math.max(pad,Math.min(WIDTH-boxWidth-pad,p.x)),y:Math.max(44*labelScale,Math.min(HEIGHT-boxHeight-pad,p.y))}));
    const overlap=(p:Point)=>WALLS.reduce((total,w)=>total+Math.max(0,Math.min(p.x+boxWidth,w.x+w.w)-Math.max(p.x,w.x))*Math.max(0,Math.min(p.y+boxHeight,w.y+w.h)-Math.max(p.y,w.y)),0);
    const placement=candidates.reduce((best,p)=>overlap(p)<overlap(best)?p:best);
    label(roleName,placement.x+pad,placement.y+10*labelScale,'#693c2f','left');
    if(!compact){ctx.font='12px Kalam,cursive';ctx.textAlign='left';ctx.fillStyle='#693c2f';ctx.fillText(LABELS[e.tactic],placement.x+pad,placement.y+10*labelScale+17);}
  }
  const p=arena.player;
  const heading=arena.auto?Math.atan2(p.vy,p.vx):Math.atan2(pointer.y-p.y,pointer.x-p.x);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(heading);ctx.fillStyle='#e6eee0';ctx.strokeStyle=blue;ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(-13,-13);ctx.lineTo(-6,0);ctx.lineTo(-13,13);ctx.closePath();ctx.fill();ctx.stroke();
  line({x:-4,y:0},{x:9,y:0});ctx.restore();
  ctx.strokeStyle=blue;ctx.lineWidth=1.1;ctx.setLineDash([2,4]);circle(p.x,p.y,25);ctx.setLineDash([]);
  if(p.dashCooldown<=0){ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,29,Math.PI*.15,Math.PI*.85);ctx.stroke();}
  if(!arena.auto){ctx.strokeStyle='#245d7890';ctx.lineWidth=1;circle(pointer.x,pointer.y,6);line({x:pointer.x-10,y:pointer.y},{x:pointer.x+10,y:pointer.y});line({x:pointer.x,y:pointer.y-10},{x:pointer.x,y:pointer.y+10});}
  for(const effect of arena.effects){
    ctx.globalAlpha=effect.life/effect.max;ctx.strokeStyle=effect.kind==='dash'?blue:'#99512d';ctx.lineWidth=1.8;
    const r=10+(1-effect.life/effect.max)*23;
    if(effect.kind==='hit')for(let i=0;i<8;i++){const a=i*Math.PI/4;line({x:effect.x+Math.cos(a)*r*.4,y:effect.y+Math.sin(a)*r*.4},{x:effect.x+Math.cos(a)*r,y:effect.y+Math.sin(a)*r});}
    else circle(effect.x,effect.y,r);
    ctx.globalAlpha=1;
  }
}
