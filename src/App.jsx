import { useState, useRef, useCallback, useEffect } from "react";
const FONT = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Sora:wght@300;400;500;600;700;800&display=swap";
export default function App() {
  const [phase, setPhase] = useState("upload");
  const [imageSrc, setImageSrc] = useState(null);
  const [circles, setCircles] = useState([]);
  const [history, setHistory] = useState([]);
  const [dims, setDims] = useState({w:0,h:0});
  const [status, setStatus] = useState("");
  const [autoR, setAutoR] = useState(6);
  const [uniformR, setUniformR] = useState(6);
  const [uniformRMM, setUniformRMM] = useState("1.59");
  const [fillColor, setFillColor] = useState("#DCD7D2");
  const [bgEnabled, setBgEnabled] = useState(false);
  const [bgColor, setBgColor] = useState("#3DAC81");
  const [dpi, setDpi] = useState(96);
  const [viewMode, setViewMode] = useState("split");
  const [overlayOpacity, setOverlayOpacity] = useState(0.7);
  const [editMode, setEditMode] = useState(null);
  const [dragFile, setDragFile] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [maxSafeR, setMaxSafeR] = useState(100);
  const [overlapCount, setOverlapCount] = useState(0);
  const [sensitivity, setSensitivity] = useState(5); // 1-10
  const [detectionStats, setDetectionStats] = useState(null);
  const [cachedImageData, setCachedImageData] = useState(null);
  const imgRef = useRef(null);
  const off = useRef(null);
  const pvRef = useRef(null);

  // Dynamically compute the maximum radius that guarantees NO overlap
  // between any pair of circles. Recompute whenever circles change.
  useEffect(()=>{
    if(!circles.length){setMaxSafeR(100);setOverlapCount(0);return;}
    let minDist=1e9;
    for(let i=0;i<circles.length;i++){
      for(let j=i+1;j<circles.length;j++){
        const d=Math.hypot(circles[i].cx-circles[j].cx, circles[i].cy-circles[j].cy);
        if(d<minDist)minDist=d;
      }
    }
    // Max safe = half the minimum distance, minus tiny safety margin
    const safe = Math.max(1, minDist*0.495);
    setMaxSafeR(safe);
    // Count how many circles currently overlap with the uniformR
    let ov=0;
    for(let i=0;i<circles.length;i++){
      for(let j=i+1;j<circles.length;j++){
        const d=Math.hypot(circles[i].cx-circles[j].cx, circles[i].cy-circles[j].cy);
        if(d < 2*uniformR) ov++;
      }
    }
    setOverlapCount(ov);
  },[circles, uniformR]);

  // If current radius causes overlap, auto-shrink it
  useEffect(()=>{
    if(uniformR > maxSafeR && maxSafeR > 1){
      setUniformR(Math.round(maxSafeR*100)/100);
    }
  },[maxSafeR]);

  useEffect(()=>{const c=()=>setIsMobile(window.innerWidth<900);c();window.addEventListener("resize",c);return()=>window.removeEventListener("resize",c);},[]);
  useEffect(()=>{const h=e=>{if(phase!=="result"||e.target.tagName==="INPUT")return;
    if(e.key==="v")setEditMode(null);if(e.key==="a")setEditMode(p=>p==="add"?null:"add");
    if(e.key==="d")setEditMode(p=>p==="delete"?null:"delete");
    if(e.key==="1")setViewMode("split");if(e.key==="2")setViewMode("overlay");if(e.key==="3")setViewMode("svg");
    if((e.ctrlKey||e.metaKey)&&e.key==="z"){e.preventDefault();undo();}
  };window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[phase,history,circles]);

  // Simple box blur - iOS safe
  const boxBlur=(src,dst,W,H,r)=>{const tmp=new Uint8ClampedArray(src.length),w2=r*2+1;
    for(let y=0;y<H;y++){let rs=0,gs=0,bs=0;for(let i=-r;i<=r;i++){const x=Math.max(0,Math.min(W-1,i)),j=(y*W+x)*4;rs+=src[j];gs+=src[j+1];bs+=src[j+2];}
      for(let x=0;x<W;x++){const j=(y*W+x)*4;tmp[j]=rs/w2;tmp[j+1]=gs/w2;tmp[j+2]=bs/w2;tmp[j+3]=255;const xO=Math.max(0,Math.min(W-1,x-r)),xI=Math.max(0,Math.min(W-1,x+r+1)),jO=(y*W+xO)*4,jI=(y*W+xI)*4;rs+=src[jI]-src[jO];gs+=src[jI+1]-src[jO+1];bs+=src[jI+2]-src[jO+2];}}
    for(let x=0;x<W;x++){let rs=0,gs=0,bs=0;for(let i=-r;i<=r;i++){const y=Math.max(0,Math.min(H-1,i)),j=(y*W+x)*4;rs+=tmp[j];gs+=tmp[j+1];bs+=tmp[j+2];}
      for(let y=0;y<H;y++){const j=(y*W+x)*4;dst[j]=rs/w2;dst[j+1]=gs/w2;dst[j+2]=bs/w2;dst[j+3]=255;const yO=Math.max(0,Math.min(H-1,y-r)),yI=Math.max(0,Math.min(H-1,y+r+1)),jO=(yO*W+x)*4,jI=(yI*W+x)*4;rs+=tmp[jI]-tmp[jO];gs+=tmp[jI+1]-tmp[jO+1];bs+=tmp[jI+2]-tmp[jO+2];}}};

  // ═══ DETECTION v14 ═══
  // Simplified and robust: proven core + sensitivity control + stats
  const runDetection=useCallback((imgEl, sensOverride)=>{
    if(!imgEl?.naturalWidth)return;setPhase("detecting");setStatus("Reading image...");
    setTimeout(()=>{try{
      const cv=off.current,ctx=cv.getContext("2d",{willReadFrequently:true});
      const W=imgEl.naturalWidth,H=imgEl.naturalHeight;cv.width=W;cv.height=H;
      ctx.drawImage(imgEl,0,0);const raw=ctx.getImageData(0,0,W,H).data;

      const sens = sensOverride !== undefined ? sensOverride : sensitivity;

      setStatus("Stage 1/5: Blurring image...");
      const blur=new Uint8ClampedArray(raw.length),t1=new Uint8ClampedArray(raw.length);
      // Gentle blur: only 2 passes of radius 1 (keeps dense beads strictly separated)
      boxBlur(raw,t1,W,H,1);boxBlur(t1,blur,W,H,1);

      setStatus("Stage 2/5: Analyzing background...");
      // Median BG
      const epR=[],epG=[],epB=[];
      for(let i=0;i<W;i+=Math.max(1,W>>5)){for(let d=0;d<3;d++){
        let j=(Math.min(d,H-1)*W+i)*4;epR.push(blur[j]);epG.push(blur[j+1]);epB.push(blur[j+2]);
        j=(Math.min(H-1-d,H-1)*W+i)*4;epR.push(blur[j]);epG.push(blur[j+1]);epB.push(blur[j+2]);
      }}
      for(let i=0;i<H;i+=Math.max(1,H>>5)){for(let d=0;d<3;d++){
        let j=(i*W+Math.min(d,W-1))*4;epR.push(blur[j]);epG.push(blur[j+1]);epB.push(blur[j+2]);
        j=(i*W+Math.min(W-1-d,W-1))*4;epR.push(blur[j]);epG.push(blur[j+1]);epB.push(blur[j+2]);
      }}
      epR.sort((a,b)=>a-b);epG.sort((a,b)=>a-b);epB.sort((a,b)=>a-b);
      const mid=epR.length>>1;
      const bgR=epR[mid],bgG=epG[mid],bgB=epB[mid];

      setStatus("Stage 3/5: Building bead map...");
      const bm=new Float32Array(W*H);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const i=y*W+x,j=i*4;
        const r=blur[j],g=blur[j+1],b=blur[j+2];
        const dR = r - bgR, dG = g - bgG, dB = b - bgB;
        const dist = Math.sqrt(dR*dR + dG*dG + dB*dB);
        bm[i] = dist;
      }

      setStatus("Stage 4/5: Finding peaks...");
      // For color distance, range is 0-441. Higher sens = lower threshold.
      const peakThresh = Math.max(15, 60 - sens * 4);
      const sr=3,sr2=sr*sr; let maxima=[];
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const v=bm[y*W+x]; if(v<peakThresh) continue;
        let ok=true;
        o:for(let dy=-sr;dy<=sr;dy++)for(let dx=-sr;dx<=sr;dx++){
          if(!dy&&!dx)continue;if(dx*dx+dy*dy>sr2)continue;
          const nx=x+dx,ny=y+dy;
          if(nx>=0&&nx<W&&ny>=0&&ny<H&&bm[ny*W+nx]>v){ok=false;break o;}}
        if(ok) maxima.push([x,y,v]);
      }
      maxima.sort((a,b)=>b[2]-a[2]);

      // NMS with 4px (allows denser packing)
      let kept=[];
      for(const[mx,my,mv]of maxima){
        let ok=true;
        for(const[kx,ky]of kept)if((mx-kx)**2+(my-ky)**2<16){ok=false;break;}
        if(ok) kept.push([mx,my,mv]);
      }
      const initialCount = kept.length;

      if(kept.length<3){setStatus("No beads found. Try higher sensitivity.");setPhase("upload");return;}

      // Mode NN
      let cents=kept.map(k=>[k[0],k[1]]);
      const computeNN=(list)=>list.map((c,i)=>{let m=1e9;for(let j=0;j<list.length;j++){
        if(i===j)continue;const d=Math.hypot(c[0]-list[j][0],c[1]-list[j][1]);if(d<m)m=d;}return m;});
      let nn=computeNN(cents);
      let freq={};nn.forEach(d=>{const k=Math.round(d);freq[k]=(freq[k]||0)+1;});
      let mNN=0,mC=0;for(const[k,v]of Object.entries(freq))if(v>mC){mC=v;mNN=+k;}

      // Dedup with a much smaller threshold (0.35 * mode_nn) so it perfectly separates rings of beads
      const minD=Math.max(2, mNN*0.35),minD2=minD*minD;
      const scored=kept.slice().sort((a,b)=>b[2]-a[2]);const dd=[];
      for(const[cx,cy,sc]of scored){let ok=true;
        for(const[ex,ey]of dd)if((cx-ex)**2+(cy-ey)**2<minD2){ok=false;break;}
        if(ok) dd.push([cx,cy,sc]);}

      setStatus("Stage 5/5: Refining positions...");
      // Centroid + parabolic sub-pixel refinement
      const tmpR=mNN*0.45,wr=Math.max(2,Math.round(tmpR)),wr2=wr*wr,mMv=tmpR*0.6;
      const ref=[];
      for(const[ix,iy,iscore] of dd){
        let cx=ix,cy=iy;
        // PERFECT CENTERING: only average pixels that are >50% of the peak value
        // This stops neighbors from pulling the center of mass off-target
        const peakV = bm[Math.round(iy)*W+Math.round(ix)] || iscore;
        const thresh = Math.max(10, peakV * 0.5);
        for(let it=0;it<3;it++){let sx=0,sy=0,sw=0;
          for(let dy=-wr;dy<=wr;dy++)for(let dx=-wr;dx<=wr;dx++){
            if(dx*dx+dy*dy>wr2)continue;const nx=Math.round(cx+dx),ny=Math.round(cy+dy);
            if(nx>=0&&nx<W&&ny>=0&&ny<H){const wt=bm[ny*W+nx];if(wt>thresh){sx+=nx*wt;sy+=ny*wt;sw+=wt;}}}
          if(sw>0){let ncx=sx/sw,ncy=sy/sw;const mx2=ncx-cx,my2=ncy-cy,md=Math.sqrt(mx2*mx2+my2*my2);
            if(md>mMv){ncx=cx+mx2*mMv/md;ncy=cy+my2*mMv/md;}
            if(Math.abs(ncx-cx)<0.1&&Math.abs(ncy-cy)<0.1){cx=ncx;cy=ncy;break;}cx=ncx;cy=ncy;}}
        ref.push([cx,cy,iscore]);
      }

      // === OUTLIER REMOVAL ===
      // Ultra-relaxed for perfect geometrical shapes
      const final=[];
      let removedIsolated=0, removedTooClose=0;
      const iso2 = (mNN * 3.0) ** 2; // Allow large gaps without deleting
      const tooClose2 = Math.max(3, (mNN * 0.4) ** 2); // Very strict "too close"
      for(let i=0;i<ref.length;i++){
        const[cx,cy,sc]=ref[i];
        let hasNeighbor=false, tooClose=false, minD2Found=1e9;
        for(let j=0;j<ref.length;j++){
          if(i===j)continue;
          const d2=(ref[j][0]-cx)**2+(ref[j][1]-cy)**2;
          if(d2<minD2Found)minD2Found=d2;
          if(d2<iso2)hasNeighbor=true;
          if(d2<tooClose2)tooClose=true;
        }
        // Only delete isolated points if they are extremely weak noise (sc < 30)
        if(!hasNeighbor && sc<30){removedIsolated++;continue;}
        if(tooClose){
          let isBest=true;
          for(let j=0;j<ref.length;j++){
            if(i===j)continue;
            const d2=(ref[j][0]-cx)**2+(ref[j][1]-cy)**2;
            if(d2<tooClose2 && ref[j][2]>sc){isBest=false;break;}
          }
          if(!isBest){removedTooClose++;continue;}
        }
        final.push([cx,cy,sc]);
      }

      if(final.length<2){setStatus("Too few beads. Adjust sensitivity.");setPhase("upload");return;}

      // SAFE RADIUS — guaranteed no overlap
      // Use percentile-based min NN to avoid being thrown off by a single bad pair
      let allNN=[];
      for(let i=0;i<final.length;i++){
        let m=1e9;
        for(let j=0;j<final.length;j++){
          if(i===j)continue;
          const d=Math.hypot(final[i][0]-final[j][0],final[i][1]-final[j][1]);
          if(d<m)m=d;
        }
        allNN.push(m);
      }
      allNN.sort((a,b)=>a-b);
      const minNN = allNN[0];
      // Radius: safely between 0 and half the minimum distance
      const bR = Math.min(mNN*0.45, minNN*0.495);

      // Bead color (average)
      let cr=0,cg=0,cb=0;
      for(const[x,y] of final){const j=(Math.round(y)*W+Math.round(x))*4;cr+=raw[j];cg+=raw[j+1];cb+=raw[j+2];}
      cr=Math.round(cr/final.length);cg=Math.round(cg/final.length);cb=Math.round(cb/final.length);

      const det=final.map(([x,y,sc],i)=>({
        cx:x,cy:y,r:bR,
        confidence:Math.min(1,sc/100),
        id:i+"_"+Math.random().toString(36).slice(2,6)
      }));

      setFillColor("#"+[cr,cg,cb].map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,"0")).join(""));
      setBgColor("#"+[Math.round(bgR),Math.round(bgG),Math.round(bgB)].map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,"0")).join(""));
      setBgEnabled(false);setAutoR(Math.round(bR*100)/100);setUniformR(Math.round(bR*100)/100);
      setCircles(det);setHistory([]);setDims({w:W,h:H});
      setDetectionStats({
        initial: initialCount,
        outliersRemoved: removedIsolated + removedTooClose,
        total: det.length,
        sensitivity: sens,
        modeNN: mNN,
        minNN: minNN
      });
      setPhase("result");setStatus("");
    }catch(e){setStatus("Error: "+e.message);setPhase("upload");}},50);
  },[sensitivity]);

  const rerunDetection=useCallback((newSens)=>{
    if(imgRef.current)runDetection(imgRef.current, newSens);
  },[runDetection]);

  const loadImg=src=>{setImageSrc(src);setCircles([]);setHistory([]);setPhase("upload");setDownloadUrl(null);setDownloadUrlWithImage(null);setDetectionStats(null);};
  const onFile=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>loadImg(ev.target.result);r.readAsDataURL(f);e.target.value="";};
  const onImgLoad=()=>{if(imgRef.current)runDetection(imgRef.current);};
  useEffect(()=>{const h=e=>{const items=e.clipboardData?.items;if(!items)return;for(const item of items)if(item.type.startsWith("image/")){e.preventDefault();const blob=item.getAsFile();const r=new FileReader();r.onload=ev=>loadImg(ev.target.result);r.readAsDataURL(blob);return;}};document.addEventListener("paste",h);return()=>document.removeEventListener("paste",h);},[]);
  const pushHistory=()=>{setHistory(h=>[...h.slice(-30),JSON.stringify(circles)]);};
  const undo=()=>{if(!history.length)return;setHistory(h=>h.slice(0,-1));setCircles(JSON.parse(history[history.length-1]));};
  const handleInt=useCallback((cX,cY)=>{if(!editMode||!pvRef.current)return;const rect=pvRef.current.getBoundingClientRect();
    const sX=pvRef.current.width/rect.width,sY=pvRef.current.height/rect.height;let canX=(cX-rect.left)*sX,canY=(cY-rect.top)*sY;
    const mW=isMobile?Math.min(window.innerWidth-24,700):800;const sc=Math.min(mW/dims.w,mW/dims.h,1);
    let cx=canX/sc,cy=canY/sc;
    if(viewMode==="split"&&!isMobile){const hw=dims.w*sc;if(canX>hw+4)cx=(canX-hw-4)/sc;}
    if(viewMode==="split"&&isMobile){const hh=dims.h*sc;if(canY>hh+4)cy=(canY-hh-4)/sc;}
    if(editMode==="delete"){const idx=circles.findIndex(c=>Math.hypot(c.cx-cx,c.cy-cy)<uniformR*2);
      if(idx>=0){pushHistory();setCircles(cs=>cs.filter((_,i)=>i!==idx));}}
    else if(editMode==="add"){pushHistory();setCircles(cs=>[...cs,{cx,cy,r:uniformR,id:"n"+Math.random().toString(36).slice(2,8)}]);}
  },[editMode,circles,dims,uniformR,viewMode,isMobile]);
  const onClick=useCallback(e=>handleInt(e.clientX,e.clientY),[handleInt]);
  const onTouch=useCallback(e=>{if(!editMode)return;e.preventDefault();const t=e.changedTouches[0];if(t)handleInt(t.clientX,t.clientY);},[editMode,handleInt]);

  useEffect(()=>{const cv=pvRef.current;if(!cv||!dims.w||!circles.length||!imgRef.current)return;
    const ctx=cv.getContext("2d");const mW=isMobile?Math.min(window.innerWidth-24,700):800;const sc=Math.min(mW/dims.w,mW/dims.h,1);
    const dC=(ox,oy)=>{ctx.fillStyle=fillColor;circles.forEach(c=>{ctx.beginPath();ctx.arc(ox+c.cx*sc,oy+c.cy*sc,Math.max(uniformR*sc,0.5),0,Math.PI*2);ctx.fill();});};
    const dB=(ox,oy,w2,h2)=>{if(bgEnabled){ctx.fillStyle=bgColor;ctx.fillRect(ox,oy,w2,h2);}else{for(let iy=0;iy<h2;iy+=10)for(let ix=0;ix<w2;ix+=10){ctx.fillStyle=((ix/10+iy/10)&1)?"#1A1A1A":"#222";ctx.fillRect(ox+ix,oy+iy,10,10);}}};
    if(viewMode==="split"){if(isMobile){cv.width=dims.w*sc;cv.height=dims.h*sc*2+4;ctx.drawImage(imgRef.current,0,0,dims.w*sc,dims.h*sc);ctx.fillStyle="#444";ctx.fillRect(0,dims.h*sc,cv.width,4);dB(0,dims.h*sc+4,dims.w*sc,dims.h*sc);dC(0,dims.h*sc+4);}
      else{cv.width=dims.w*sc*2+4;cv.height=dims.h*sc;ctx.drawImage(imgRef.current,0,0,dims.w*sc,dims.h*sc);ctx.fillStyle="#444";ctx.fillRect(dims.w*sc,0,4,cv.height);dB(dims.w*sc+4,0,dims.w*sc,dims.h*sc);dC(dims.w*sc+4,0);}}
    else if(viewMode==="overlay"){cv.width=dims.w*sc;cv.height=dims.h*sc;ctx.drawImage(imgRef.current,0,0,dims.w*sc,dims.h*sc);ctx.fillStyle=fillColor;ctx.globalAlpha=overlayOpacity;circles.forEach(c=>{ctx.beginPath();ctx.arc(c.cx*sc,c.cy*sc,Math.max(uniformR*sc,0.5),0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;ctx.fillStyle="#FF3366";circles.forEach(c=>{ctx.beginPath();ctx.arc(c.cx*sc,c.cy*sc,1.5,0,Math.PI*2);ctx.fill();});}
    else{cv.width=dims.w*sc;cv.height=dims.h*sc;dB(0,0,cv.width,cv.height);dC(0,0);}
  },[circles,dims,fillColor,bgEnabled,bgColor,uniformR,viewMode,overlayOpacity,isMobile]);

  const px2mm=p=>(p/dpi*25.4).toFixed(2);
  const px2in=p=>(p/dpi).toFixed(3);
  const clampR=(r)=>Math.min(r, maxSafeR);
  const setRMM=v=>{setUniformRMM(v);const n=parseFloat(v);if(!isNaN(n)&&n>0){const px=Math.round(n*dpi/25.4*100)/100;setUniformR(clampR(px));}};
  const setRPX=v=>{const n=parseFloat(v);if(!isNaN(n)&&n>0){const r=clampR(n);setUniformR(r);setUniformRMM((r/dpi*25.4).toFixed(2));}};
  const setRIN=v=>{const n=parseFloat(v);if(!isNaN(n)&&n>0){setUniformR(clampR(Math.round(n*dpi*100)/100));}};
  useEffect(()=>{setUniformRMM(px2mm(uniformR));},[uniformR,dpi]);

  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadUrlWithImage, setDownloadUrlWithImage] = useState(null);

  const generateDownload=()=>{
    if(downloadUrl) URL.revokeObjectURL(downloadUrl);
    if(downloadUrlWithImage) URL.revokeObjectURL(downloadUrlWithImage);

    const{w,h}=dims;
    // Real-world dimensions in inches based on DPI
    const widthIn=(w/dpi).toFixed(4);
    const heightIn=(h/dpi).toFixed(4);

    // Build SVG header with real-world units
    // width/height in inches, viewBox in pixels for coordinate system
    const svgHead=`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${widthIn}in" height="${heightIn}in">\n`;

    // === SVG 1: Circles only (for cutting) ===
    let s=svgHead;
    if(bgEnabled) s+=`  <rect width="${w}" height="${h}" fill="${bgColor}"/>\n`;
    s+=`  <g fill="${fillColor}">\n`;
    circles.forEach(c=>{s+=`    <circle cx="${c.cx.toFixed(2)}" cy="${c.cy.toFixed(2)}" r="${uniformR.toFixed(2)}"/>\n`;});
    s+=`  </g>\n</svg>`;
    const blobSvg=new Blob([s],{type:"image/svg+xml;charset=utf-8"});
    setDownloadUrl(URL.createObjectURL(blobSvg));

    // === SVG 2: With embedded original image + circles (for reference) ===
    if(imageSrc){
      let s2=svgHead;
      // Embed image as base64 at exact pixel dimensions
      s2+=`  <image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" href="${imageSrc}" xlink:href="${imageSrc}"/>\n`;
      s2+=`  <g fill="${fillColor}" opacity="0.9">\n`;
      circles.forEach(c=>{s2+=`    <circle cx="${c.cx.toFixed(2)}" cy="${c.cy.toFixed(2)}" r="${uniformR.toFixed(2)}"/>\n`;});
      s2+=`  </g>\n</svg>`;
      const blobSvg2=new Blob([s2],{type:"image/svg+xml;charset=utf-8"});
      setDownloadUrlWithImage(URL.createObjectURL(blobSvg2));
    }
  };

  useEffect(()=>{if(phase==="result"&&circles.length)generateDownload();},[circles,fillColor,bgEnabled,bgColor,uniformR,imageSrc,dpi]);

  const ac="#C73E1D";
  const Chk=({on})=><span style={{width:14,height:14,borderRadius:3,display:"inline-flex",alignItems:"center",justifyContent:"center",border:`2px solid ${on?ac:"#444"}`,background:on?ac:"#0D0D0D",fontSize:8,color:"#FFF",flexShrink:0}}>{on&&"✓"}</span>;

  return(<>
    <link href={FONT} rel="stylesheet"/>
    <style>{`*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}html,body{background:#080808;overflow-x:hidden}
::-webkit-scrollbar{width:8px}::-webkit-scrollbar-track{background:#0D0D0D}::-webkit-scrollbar-thumb{background:#222;border-radius:4px}
input[type=range]{accent-color:${ac};width:100%;height:24px;cursor:pointer;-webkit-appearance:none;background:transparent}
input[type=range]::-webkit-slider-runnable-track{height:4px;background:#1F1F1F;border-radius:2px}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:${ac};margin-top:-6px}
input[type=color]{-webkit-appearance:none;border:none;cursor:pointer;padding:0}input[type=color]::-webkit-color-swatch-wrapper{padding:0}
input[type=color]::-webkit-color-swatch{border:1px solid #2A2A2A;border-radius:4px}
@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes sp{from{transform:rotate(0)}to{transform:rotate(360deg)}}.fi{animation:fi .35s cubic-bezier(0.16,1,0.3,1) both}
.ni{width:76px;padding:8px;border-radius:6px;border:1px solid #1F1F1F;font-size:13px;font-family:'JetBrains Mono',monospace;text-align:center;outline:none;color:#EEE;background:#0D0D0D;-webkit-appearance:none}.ni:focus{border-color:${ac}}
.ch{padding:6px 10px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #1F1F1F;background:#0D0D0D;color:#777;font-family:'JetBrains Mono',monospace;transition:all .12s;white-space:nowrap;-webkit-appearance:none;touch-action:manipulation}
.ch:hover{border-color:${ac};color:${ac}}.ca{background:${ac}!important;color:#FFF!important;border-color:${ac}!important}
.cd{background:#0D0D0D;border-radius:8px;border:1px solid #1A1A1A;padding:16px}
.sl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.8px;color:#888;margin-bottom:11px;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;gap:6px}.sl::before{content:'';width:3px;height:10px;background:${ac};border-radius:1px}
.bp{padding:13px 22px;border-radius:7px;border:none;background:${ac};color:#FFF;font-weight:600;font-size:13px;cursor:pointer;font-family:'Sora',sans-serif;width:100%;-webkit-appearance:none;touch-action:manipulation;transition:all .15s}
.bp:hover{filter:brightness(1.1);transform:translateY(-1px)}.bp:disabled{opacity:0.3;transform:none}
.bg2{padding:7px 12px;border-radius:6px;border:1px solid #1F1F1F;background:#0D0D0D;color:#888;font-size:11px;cursor:pointer;font-family:'JetBrains Mono',monospace;-webkit-appearance:none;touch-action:manipulation}.bg2:hover{border-color:${ac};color:${ac}}
.toolbar{display:flex;gap:2px;background:#0D0D0D;padding:3px;border-radius:7px;border:1px solid #1A1A1A}
.tbtn{padding:7px 13px;border-radius:5px;font-size:11px;cursor:pointer;border:none;background:transparent;color:#777;font-family:'JetBrains Mono',monospace;-webkit-appearance:none;touch-action:manipulation}.tbtn:hover{color:#EEE;background:#161616}.tba{color:#FFF!important;background:${ac}!important}
.stat-num{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;color:${ac};line-height:1}.stat-lbl{font-family:'JetBrains Mono',monospace;font-size:8px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-top:3px}
.kbd{display:inline-block;padding:1px 5px;border-radius:3px;background:#1A1A1A;border:1px solid #2A2A2A;font-family:'JetBrains Mono',monospace;font-size:9px;color:#666;border-bottom-width:2px}`}</style>

    {imageSrc&&<img ref={imgRef} src={imageSrc} onLoad={onImgLoad} crossOrigin="anonymous" style={{display:"none"}}/>}
    <canvas ref={off} style={{display:"none"}}/>
    <div style={{fontFamily:"'Sora',sans-serif",minHeight:"100vh",background:"#080808",color:"#DDD"}}>
      <div style={{padding:"12px 20px",background:"#0A0A0A",borderBottom:"1px solid #1A1A1A",display:"flex",alignItems:"center",gap:14,position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${ac},#FF6B47)`,display:"flex",alignItems:"center",justifyContent:"center",color:"#FFF",fontWeight:800,fontSize:14,fontFamily:"'JetBrains Mono',monospace"}}>◎</div>
          <div><div style={{fontSize:15,fontWeight:700}}>RHINESTONE VECTORIZER</div></div></div>
        <div style={{flex:1}}/>
        {phase==="result"&&<>
          {!isMobile&&<div style={{display:"flex",alignItems:"center",gap:14,padding:"0 20px",borderRight:"1px solid #1A1A1A",borderLeft:"1px solid #1A1A1A"}}>
            <div style={{textAlign:"center"}}><div className="stat-num">{circles.length}</div><div className="stat-lbl">Beads</div></div>
            <div style={{textAlign:"center"}}><div className="stat-num">{dims.w}×{dims.h}</div><div className="stat-lbl">Pixels</div></div></div>}
          <button className="bg2" onClick={undo} disabled={!history.length} style={{opacity:history.length?1:0.3}}>↶</button>
          <label htmlFor="hf" className="bg2" style={{cursor:"pointer"}}>↻ New</label>
          <input id="hf" type="file" accept="image/*" onChange={onFile} style={{position:"absolute",left:"-9999px",width:1,height:1,opacity:0}}/></>}
      </div>

      {phase==="upload"&&(<div className="fi" style={{padding:24,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"calc(100vh - 60px)",backgroundImage:"radial-gradient(circle at 1px 1px,#1A1A1A 1px,transparent 0)",backgroundSize:"24px 24px"}}
        onDragOver={e=>{e.preventDefault();setDragFile(true);}} onDragLeave={()=>setDragFile(false)}
        onDrop={e=>{e.preventDefault();setDragFile(false);const f=e.dataTransfer.files[0];if(f?.type.startsWith("image/")){const r=new FileReader();r.onload=ev=>loadImg(ev.target.result);r.readAsDataURL(f);}}}>
        <label htmlFor="mf" style={{border:`2px dashed ${dragFile?ac:"#222"}`,borderRadius:16,padding:"60px 50px",textAlign:"center",cursor:"pointer",background:dragFile?"#150808":"#0A0A0A",maxWidth:520,width:"100%",display:"block",transition:"all .25s"}}>
          <div style={{fontSize:60,marginBottom:18,background:`linear-gradient(135deg,${ac},#FF6B47)`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>◎</div>
          <div style={{fontSize:20,fontWeight:700,marginBottom:6,color:"#EEE"}}>Upload rhinestone image</div>
          <div style={{fontSize:12,color:"#666",marginBottom:22}}>Green · Pink · Any colored background</div>
          <div style={{display:"inline-block",padding:"13px 28px",borderRadius:8,background:`linear-gradient(135deg,${ac},#FF6B47)`,color:"#FFF",fontWeight:600,fontSize:13}}>Choose File</div>
          <div style={{marginTop:22,fontSize:10,color:"#444",fontFamily:"'JetBrains Mono',monospace"}}>DROP · <span className="kbd">CTRL</span>+<span className="kbd">V</span> PASTE · PNG/JPG</div>
        </label>
        <input id="mf" type="file" accept="image/*" onChange={onFile} style={{position:"absolute",left:"-9999px",width:1,height:1,opacity:0}}/>
        {status&&<div style={{marginTop:14,padding:"10px 16px",background:"#150808",borderRadius:7,color:ac,fontSize:11,maxWidth:520,textAlign:"center",border:`1px solid ${ac}33`}}>{status}</div>}
      </div>)}

      {phase==="detecting"&&(<div className="fi" style={{padding:50,textAlign:"center",minHeight:"calc(100vh - 60px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontSize:48,marginBottom:20,color:ac,animation:"sp 1.2s linear infinite"}}>◎</div><div style={{fontSize:14,fontWeight:600,color:"#999"}}>{status}</div></div>)}

      {phase==="result"&&circles.length>0&&(
        <div className="fi" style={{padding:isMobile?"10px":"16px 20px",...(!isMobile&&{display:"grid",gridTemplateColumns:"1fr 310px",gap:16,maxWidth:1500,margin:"0 auto"})}}>
          <div>
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
              <div className="toolbar">{[["split","Split"],["overlay","Overlay"],["svg","SVG"]].map(([k,l])=>
                <button key={k} className={`tbtn ${viewMode===k?"tba":""}`} onClick={()=>setViewMode(k)}>{l}</button>)}</div>
              {viewMode==="overlay"&&<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:9,color:"#555"}}>Op</span>
                <input type="range" min="0.1" max="1" step="0.05" value={overlayOpacity} onChange={e=>setOverlayOpacity(+e.target.value)} style={{width:70}}/></div>}
              <div style={{flex:1}}/>
              <div className="toolbar">
                <button className={`tbtn ${editMode===null?"tba":""}`} onClick={()=>setEditMode(null)}>👁{!isMobile?" View":""}</button>
                <button className={`tbtn ${editMode==="add"?"tba":""}`} onClick={()=>setEditMode(editMode==="add"?null:"add")}>+{!isMobile?" Add":""}</button>
                <button className={`tbtn ${editMode==="delete"?"tba":""}`} onClick={()=>setEditMode(editMode==="delete"?null:"delete")}>−{!isMobile?" Del":""}</button></div></div>
            <div className="cd" style={{textAlign:"center",padding:isMobile?8:14,marginBottom:10,position:"relative",cursor:editMode==="add"?"crosshair":editMode==="delete"?"pointer":"default",...(!isMobile&&{maxHeight:"calc(100vh - 160px)",overflow:"auto"})}}>
              {editMode&&<div style={{position:"absolute",top:8,left:12,padding:"5px 11px",borderRadius:5,background:editMode==="add"?"#0A4A1F":"#4A0A0A",color:"#FFF",fontSize:10,fontFamily:"'JetBrains Mono',monospace",zIndex:2,fontWeight:700}}>{editMode==="add"?(isMobile?"TAP ADD":"CLICK TO ADD"):(isMobile?"TAP DEL":"CLICK TO REMOVE")}</div>}
              <canvas ref={pvRef} onClick={onClick} onTouchEnd={onTouch} style={{borderRadius:6,maxWidth:"100%",border:"1px solid #1A1A1A",cursor:"inherit",display:"block",margin:"0 auto"}}/></div>
            {!isMobile&&<div style={{padding:"8px 14px",background:"#0A0A0A",borderRadius:6,border:"1px solid #1A1A1A",fontSize:9,color:"#444",fontFamily:"'JetBrains Mono',monospace"}}>
              <span className="kbd">V</span> View · <span className="kbd">A</span> Add · <span className="kbd">D</span> Del · <span className="kbd">1</span><span className="kbd">2</span><span className="kbd">3</span> Views · <span className="kbd">Ctrl+Z</span> Undo</div>}
            {isMobile&&<div style={{display:"flex",gap:14,marginBottom:10,padding:"10px 14px",background:"#0D0D0D",borderRadius:8,border:"1px solid #1A1A1A"}}>
              <div><div className="stat-num">{circles.length}</div><div className="stat-lbl">Beads</div></div><div><div className="stat-num">{dims.w}×{dims.h}</div><div className="stat-lbl">px</div></div></div>}
          </div>
          <div style={{display:"flex",flexDirection:isMobile?"row":"column",gap:isMobile?8:12,flexWrap:"wrap"}}>
            <div className="cd" style={{flex:isMobile?"1 1 100%":"auto"}}><div className="sl">Detection</div>
              {detectionStats&&<div style={{fontSize:10,color:"#888",marginBottom:10,fontFamily:"'JetBrains Mono',monospace",padding:"8px 10px",background:"#0A0A0A",borderRadius:5,border:"1px solid #161616",lineHeight:1.6}}>
                <div>Initial detection: <span style={{color:"#EEE"}}>{detectionStats.initial}</span></div>
                <div>− Outliers removed: <span style={{color:"#F88"}}>−{detectionStats.outliersRemoved}</span></div>
                <div style={{borderTop:"1px solid #222",marginTop:4,paddingTop:4}}>Final: <span style={{color:ac,fontWeight:700}}>{detectionStats.total}</span> beads</div>
                <div>Spacing: <span style={{color:"#EEE"}}>{detectionStats.modeNN}px</span> avg</div>
              </div>}
              <div style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:10,color:"#888",fontFamily:"'JetBrains Mono',monospace"}}>Sensitivity</span>
                  <span style={{fontSize:11,color:ac,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{sensitivity}/10</span>
                </div>
                <input type="range" min="1" max="10" step="1" value={sensitivity} onChange={e=>setSensitivity(+e.target.value)} style={{marginBottom:4}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#444",fontFamily:"'JetBrains Mono',monospace"}}>
                  <span>Strict</span><span>Balanced</span><span>Catch all</span>
                </div>
              </div>
              <button className="bp" style={{padding:"9px 14px",fontSize:11}} onClick={()=>rerunDetection()}>↻ Re-detect with current sensitivity</button>
              <div style={{fontSize:9,color:"#555",marginTop:6,textAlign:"center",fontFamily:"'JetBrains Mono',monospace"}}>
                Lower = fewer false positives · Higher = catches more beads
              </div>
            </div>
            <div className="cd" style={{flex:isMobile?"1 1 100%":"auto"}}><div className="sl">Circle Size</div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                <input className="ni" type="number" min="0.1" step="0.1" value={uniformR} onChange={e=>setRPX(e.target.value)} style={{width:64}}/>
                <span style={{fontSize:10,color:"#555",fontFamily:"'JetBrains Mono',monospace"}}>px</span>
                <span style={{color:"#222"}}>│</span>
                <input className="ni" type="number" min="0.01" step="0.1" value={uniformRMM} onChange={e=>setRMM(e.target.value)} style={{width:64}}/>
                <span style={{fontSize:10,color:"#555",fontFamily:"'JetBrains Mono',monospace"}}>mm</span>
                <span style={{color:"#222"}}>│</span>
                <input className="ni" type="number" min="0.001" step="0.01" value={px2in(uniformR)} onChange={e=>setRIN(e.target.value)} style={{width:64}}/>
                <span style={{fontSize:10,color:"#555",fontFamily:"'JetBrains Mono',monospace"}}>in</span>
                <button className="ch" style={{marginLeft:"auto"}} onClick={()=>setUniformR(clampR(autoR))}>↻ Auto</button></div>
              <input type="range" min="0.5" max={maxSafeR} step="0.1" value={uniformR} onChange={e=>setRPX(e.target.value)} style={{marginBottom:6}}/>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:9,color:"#555",fontFamily:"'JetBrains Mono',monospace",marginBottom:8}}>
                <span>Max safe: <span style={{color:"#7DD181"}}>{maxSafeR.toFixed(1)}px ({(maxSafeR/dpi*25.4).toFixed(2)}mm)</span></span>
                <button className="ch" style={{padding:"3px 8px",fontSize:9}} onClick={()=>setUniformR(Math.round(maxSafeR*100)/100)}>Max fit</button>
              </div>
              {overlapCount>0&&<div style={{padding:"5px 8px",background:"#4A0A0A",border:"1px solid #F44",borderRadius:4,fontSize:10,color:"#FFB4B4",marginBottom:8}}>⚠ {overlapCount} overlapping pair(s) — reduce radius</div>}
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {[0.5,1.0,1.5,2.0,2.3,2.5,3.0,4.0,5.0].map(mm=>{
                  const px=mm*dpi/25.4;
                  const disabled=px>maxSafeR;
                  return <button key={mm} className={`ch ${parseFloat(uniformRMM)===mm?"ca":""}`} style={{padding:"4px 7px",fontSize:9,opacity:disabled?0.3:1,cursor:disabled?"not-allowed":"pointer"}} onClick={()=>!disabled&&setRMM(mm.toString())} disabled={disabled}>{mm}mm</button>;
                })}</div></div>
            <div style={{display:"flex",gap:isMobile?8:12,flexDirection:isMobile?"row":"column",flex:isMobile?"1 1 100%":"auto"}}>
              <div className="cd" style={{flex:isMobile?"0 0 auto":"auto"}}><div className="sl">Colors</div>
                <div style={{display:"flex",gap:14,marginBottom:11}}>
                  <div style={{textAlign:"center"}}><input type="color" value={fillColor} onChange={e=>setFillColor(e.target.value)} style={{width:36,height:36,borderRadius:6,background:"none",padding:0}}/><div style={{fontSize:8,color:"#555",marginTop:3,fontFamily:"'JetBrains Mono',monospace"}}>FILL</div></div>
                  <div style={{textAlign:"center",opacity:bgEnabled?1:0.3}}><input type="color" value={bgColor} onChange={e=>setBgColor(e.target.value)} disabled={!bgEnabled} style={{width:36,height:36,borderRadius:6,background:"none",padding:0}}/><div style={{fontSize:8,color:"#555",marginTop:3,fontFamily:"'JetBrains Mono',monospace"}}>BG</div></div></div>
                <label onClick={()=>setBgEnabled(!bgEnabled)} style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:11,color:"#888"}}><Chk on={bgEnabled}/> Background</label></div>
              <div className="cd" style={{flex:1}}><div className="sl">Export</div>
                <div style={{fontSize:10,color:"#888",marginBottom:10,fontFamily:"'JetBrains Mono',monospace",padding:"8px 10px",background:"#0A0A0A",borderRadius:5,border:"1px solid #161616",lineHeight:1.7}}>
                  <div>Image: <span style={{color:"#EEE"}}>{dims.w}×{dims.h}px</span></div>
                  <div>Real size: <span style={{color:"#EEE"}}>{px2in(dims.w)}″ × {px2in(dims.h)}″</span></div>
                  <div>Metric: <span style={{color:"#EEE"}}>{px2mm(dims.w)} × {px2mm(dims.h)}mm</span></div>
                  <div>Circles: <span style={{color:"#EEE"}}>{circles.length}</span> × r={uniformR.toFixed(1)}px ({px2mm(uniformR)}mm)</div>
                  <div>Status: {overlapCount>0?<span style={{color:"#F88"}}>⚠ {overlapCount} overlap(s)</span>:<span style={{color:"#7DD181"}}>✓ No overlaps</span>}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:10}}>
                  <span style={{fontSize:9,color:"#555",fontFamily:"'JetBrains Mono',monospace"}}>DPI</span>
                  {[72,96,150,300].map(v=><button key={v} className={`ch ${dpi===v?"ca":""}`} style={{padding:"4px 7px",fontSize:9}} onClick={()=>setDpi(v)}>{v}</button>)}
                </div>
                {downloadUrlWithImage&&<a href={downloadUrlWithImage} download="rhinestone_with_image.svg" className="bp" style={{display:"block",textAlign:"center",textDecoration:"none",color:"#FFF",marginBottom:6}}>⬇ SVG (Image + Circles)</a>}
                {downloadUrl&&<a href={downloadUrl} download="rhinestone_circles_only.svg" className="bp" style={{display:"block",textAlign:"center",textDecoration:"none",color:"#FFF",background:"#2A7B4F"}}>⬇ SVG (Circles Only - for cutting)</a>}
                {!downloadUrl&&<div style={{color:"#555",fontSize:11,textAlign:"center",padding:10}}>Processing...</div>}
                </div></div>
          </div>
        </div>)}
    </div>
  </>);
}
