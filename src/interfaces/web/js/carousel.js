/**
 * OmniCash — Frontend
 * Carrusel de propaganda de la portada (banners SVG estilo BCP/BBVA).
 * Auto-avance con barra de progreso, flechas, puntos y pausa al pasar el
 * mouse (o al tocar en móvil). No requiere sesión.
 */

(function carrusel() {
  const total = document.querySelectorAll('.carousel-slide').length;
  const dots = Array.from(document.querySelectorAll('.carousel-dot'));
  let indice = 0;
  let timer = null;
  let pausado = false;

  const progreso = 6000; // milisegundos por diapositiva

  function irA(n) {
    indice = (n + total) % total;
    document.querySelectorAll('.carousel-slide').forEach((s, i) => {
      s.classList.toggle('active', i === indice);
    });
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === indice);
      d.classList.remove('pausado');
    });
    reiniciar();
  }

  function reiniciar() {
    clearInterval(timer);
    if (pausado) return;
    // Reinicia la barra de progreso del punto activo
    dots[indice].classList.remove('active');
    void dots[indice].offsetWidth;
    dots[indice].classList.add('active');
    timer = setInterval(() => irA(indice + 1), progreso);
  }

  function pausar() {
    pausado = true;
    clearInterval(timer);
    dots.forEach(d => d.classList.add('pausado'));
  }
  function reanudar() {
    pausado = false;
    dots.forEach(d => d.classList.remove('pausado'));
    reiniciar();
  }

  const hero = document.getElementById('heroCarousel');
  if (!hero) return; // la página no tiene carrusel
  hero.addEventListener('mouseenter', pausar);
  hero.addEventListener('mouseleave', reanudar);
  hero.addEventListener('touchstart', pausar, { passive: true });
  hero.addEventListener('touchend', reanudar, { passive: true });

  document.getElementById('carPrev').addEventListener('click', () => irA(indice - 1));
  document.getElementById('carNext').addEventListener('click', () => irA(indice + 1));
  dots.forEach(d => d.addEventListener('click', () => irA(Number(d.dataset.slide))));

  irA(0);
})();
