// Runs before first paint: apply the persisted theme class so the page does not
// flash the wrong background. Dark is the default. Kept as a separate file so the
// Content-Security-Policy can forbid inline scripts.
(function () {
	try {
		var t = localStorage.getItem('meshify.theme');
		document.documentElement.classList.add(t === 'light' ? 'light' : 'dark');
	} catch (e) {
		document.documentElement.classList.add('dark');
	}
})();
