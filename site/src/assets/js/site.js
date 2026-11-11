// Lupa — small progressive enhancements. The site works fully without JS.
(function(){
  var d=document;
  // 1. Remember language choice (used by the root redirect).
  try{
    var cur=d.body&&d.body.getAttribute('data-lang');
    if(cur) localStorage.setItem('lupa-lang',cur);
    d.addEventListener('click',function(e){
      var a=e.target.closest&&e.target.closest('[data-setlang]');
      if(a) localStorage.setItem('lupa-lang',a.getAttribute('data-setlang'));
    });
  }catch(e){}

  // 2. Mobile menu.
  var btn=d.querySelector('.menu-btn'), hdr=d.querySelector('.site-header');
  if(btn&&hdr){
    var lab=btn.querySelector('.sr');
    function set(open){
      hdr.classList.toggle('open',open); btn.setAttribute('aria-expanded',open?'true':'false');
      if(lab) lab.textContent=open?btn.getAttribute('data-close'):btn.getAttribute('data-open');
    }
    btn.addEventListener('click',function(){set(btn.getAttribute('aria-expanded')!=='true')});
    d.addEventListener('keydown',function(e){if(e.key==='Escape'&&hdr.classList.contains('open')){set(false);btn.focus()}});
  }

  // 3. Reveal on scroll (skipped when reduced motion is requested).
  var els=d.querySelectorAll('.reveal');
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!('IntersectionObserver' in window)||reduce){els.forEach(function(el){el.classList.add('in')})}
  else{
    var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target)}})},{rootMargin:'0px 0px -8% 0px'});
    els.forEach(function(el){io.observe(el)});
  }

  // 4. Newsletter forms. Live mode posts to the provider; demo mode opens a pre-filled email.
  d.querySelectorAll('.nl-form').forEach(function(f){
    f.addEventListener('submit',function(e){
      var input=f.querySelector('input[type=email]'), st=f.querySelector('.nl-status');
      var v=(input.value||'').trim();
      var ok=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
      input.setAttribute('aria-invalid',ok?'false':'true');
      if(!ok){e.preventDefault();st.textContent=f.getAttribute('data-bad');st.className='nl-status err';input.focus();return}
      if(f.getAttribute('data-live')==='1'){st.textContent=f.getAttribute('data-ok');st.className='nl-status ok';return}
      e.preventDefault();
      var lang=(f.querySelector('.nl-lang input:checked')||{}).value||'hr';
      var body=(d.body.getAttribute('data-lang')==='hr'?'Molim prijavu na newsletter Lupa.\nE-adresa: ':'Please sign me up for the Lupa newsletter.\nEmail: ')+v+'\nLang: '+lang;
      window.location.href='mailto:'+f.getAttribute('data-mailto')+'?subject='+encodeURIComponent(f.getAttribute('data-subject'))+'&body='+encodeURIComponent(body);
      st.textContent=f.getAttribute('data-ok');st.className='nl-status ok';
    });
  });
  // 5. Subscriptions. The full text of subscriber-only articles is never in this page or this file:
  //    it is fetched from /api/article, which checks the httpOnly session cookie against Stripe first.
  function api(path,opt){return fetch(path,Object.assign({credentials:'same-origin',headers:{'Accept':'application/json'},cache:'no-store'},opt||{}))}
  var qs=new URLSearchParams(location.search);
  var pw=d.getElementById('paywall'), pb=d.getElementById('paid-body');
  if(pw&&pb){
    var st=pw.querySelector('.pw-status');
    st.textContent=st.getAttribute('data-checking');
    api('/api/article?post='+encodeURIComponent(pw.getAttribute('data-post'))+'&lang='+encodeURIComponent(pw.getAttribute('data-lang')))
      .then(function(r){
        if(r.ok) return r.json().then(function(j){
          pb.innerHTML=j.html; pb.hidden=false; pw.classList.add('is-unlocked'); pw.setAttribute('aria-hidden','true');
          pb.querySelectorAll('.reveal').forEach(function(el){el.classList.add('in')});
          var h=pb.querySelector('h2'); if(h){h.setAttribute('tabindex','-1')}
        });
        st.textContent=(r.status===401||r.status===402||r.status===403||r.status===503)?'':st.getAttribute('data-err');
      })
      .catch(function(){st.textContent=''});
  }
  var plan=d.getElementById('plan');
  if(plan){
    var nx=qs.get('next')||'', f=plan.querySelector('.sub-form');
    if(/^\/(hr|en)\/[a-z0-9\-\/]*$/.test(nx)&&f) f.querySelector('input[name=next]').value=nx;
    if(qs.get('canceled')) plan.querySelector('.pay-canceled').hidden=false;
    function inactive(){plan.querySelector('.pay-inactive').hidden=false; plan.querySelectorAll('.sub-form button').forEach(function(b){b.disabled=true})}
    if(qs.get('status')==='inactive') inactive();
    api('/api/session').then(function(r){return r.json()}).then(function(j){if(!j.payments) inactive()}).catch(function(){});
  }
  var acct=d.getElementById('account');
  if(acct){
    function show(state){
      acct.setAttribute('data-state',state);
      acct.querySelectorAll('.acct-panel').forEach(function(p){p.hidden=p.getAttribute('data-show')!==state});
    }
    api('/api/session').then(function(r){return r.json()}).then(function(j){
      if(j.active){show('active'); if(qs.get('welcome')) acct.querySelector('.acct-welcome').hidden=false}
      else if(!j.payments) show('inactive');
      else {show('none'); if(j.lapsed) acct.querySelector('.acct-lapsed').hidden=false}
      if(j.portal_login_url&&/^https:\/\/billing\.stripe\.com\//.test(j.portal_login_url)){
        var pl=acct.querySelector('.acct-portal-login'); pl.querySelector('a').href=j.portal_login_url; pl.hidden=false;
      }
    }).catch(function(){show('error')});
  }
})();
