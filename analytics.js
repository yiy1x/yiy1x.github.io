(() => {
  const source = document.currentScript;
  if (!source || window.goatcounter) return;
  if (window.location.origin !== source.dataset.analyticsOrigin) return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  if (window.location.hash === '#no-analytics') return;

  const tracker = document.createElement('script');
  tracker.async = true;
  tracker.src = source.dataset.analyticsScript;
  tracker.referrerPolicy = 'no-referrer';
  tracker.setAttribute('data-goatcounter', source.dataset.analyticsEndpoint);
  window.goatcounter = {
    path: source.dataset.analyticsPath,
    title: document.title,
    referrer: '',
    no_events: true,
    allow_local: false,
    allow_frame: false,
  };
  document.head.appendChild(tracker);
})();
