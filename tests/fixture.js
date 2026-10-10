(() => {
  const canvas=document.querySelector('#source'),ctx=canvas.getContext('2d'),video=document.querySelector('video');
  function frame() {
    const t=performance.now()/3200,w=canvas.width,h=canvas.height;
    const gradient=ctx.createLinearGradient(0,0,w,h);
    gradient.addColorStop(0,`hsl(${180+Math.sin(t)*35} 65% 35%)`);
    gradient.addColorStop(.5,`hsl(${230+Math.cos(t)*30} 50% 24%)`);
    gradient.addColorStop(1,`hsl(${320+Math.sin(t/2)*30} 60% 52%)`);
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    for(let i=0;i<4;i++) {
      const x=w*(.25+.19*i)+Math.sin(t+i)*70,y=h*.5+Math.cos(t*.8+i)*100;
      const glow=ctx.createRadialGradient(x,y,0,x,y,170);
      glow.addColorStop(0,`hsla(${160+i*50} 80% 72% / .45)`);glow.addColorStop(1,'transparent');
      ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    }
    ctx.fillStyle='#edfbff';ctx.textAlign='center';ctx.font='300 44px system-ui';ctx.fillText('Bili Liquid Glass',w/2,h/2);
    ctx.font='16px system-ui';ctx.fillStyle='rgba(237,251,255,.65)';ctx.fillText('LIGHT, BEYOND THE FRAME',w/2,h/2+42);
  }
  frame();const timer=setInterval(frame,1000/24);video.srcObject=canvas.captureStream(24);video.play().catch(()=>{});
  window.fixtureMedia={stop:()=>{clearInterval(timer);video.srcObject?.getTracks().forEach(track=>track.stop());}};
  document.querySelector('#pause').onclick=()=>video.paused?video.play():video.pause();
  document.querySelector('#webfull').onclick=()=>document.querySelector('.bpx-player-container').classList.toggle('bpx-state-web');
  document.querySelector('#full').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.querySelector('.bpx-player-container').requestFullscreen();
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
