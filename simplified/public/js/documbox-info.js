(() => {
  const compactViewport = window.matchMedia("(max-width: 768px)");
  const responsiveImages = [
    {
      selector: "#img_comp-miiub1ci img",
      desktop:
        "https://static.wixstatic.com/media/7738b6_fb72129656844c119d11423d67dd3e5f~mv2.jpg/v1/fill/w_1920,h_450,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/7738b6_fb72129656844c119d11423d67dd3e5f~mv2.jpg",
      mobile:
        "https://static.wixstatic.com/media/7738b6_fb72129656844c119d11423d67dd3e5f~mv2.jpg/v1/fill/w_980,h_451,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/7738b6_fb72129656844c119d11423d67dd3e5f~mv2.jpg",
    },
    {
      selector: "#img_comp-miiru33x img",
      desktop:
        "https://static.wixstatic.com/media/7738b6_fbe0ea0d14fa4c79920be28d7ee8d291~mv2.jpg/v1/fill/w_1617,h_549,al_c,q_85,enc_avif,quality_auto/7738b6_fbe0ea0d14fa4c79920be28d7ee8d291~mv2.jpg",
      mobile:
        "https://static.wixstatic.com/media/7738b6_fbe0ea0d14fa4c79920be28d7ee8d291~mv2.jpg/v1/fill/w_825,h_549,al_c,q_85,enc_avif,quality_auto/7738b6_fbe0ea0d14fa4c79920be28d7ee8d291~mv2.jpg",
    },
  ];

  function applyResponsiveImages() {
    const useCompactImages = compactViewport.matches;

    responsiveImages.forEach(({ selector, desktop, mobile }) => {
      const image = document.querySelector(selector);
      if (!image) {
        return;
      }

      const nextSrc = useCompactImages ? mobile : desktop;
      if (image.getAttribute("src") !== nextSrc) {
        image.setAttribute("src", nextSrc);
      }
    });
  }

  compactViewport.addEventListener("change", applyResponsiveImages);
  window.addEventListener("load", applyResponsiveImages, { once: true });
  applyResponsiveImages();
})();
