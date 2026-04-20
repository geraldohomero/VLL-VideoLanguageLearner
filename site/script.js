document.addEventListener('DOMContentLoaded', () => {
    // Parallax effect for background blobs
    const blobs = document.querySelectorAll('.blob');
    const heroShowcase = document.querySelector('.hero-showcase');
    
    document.addEventListener('mousemove', (e) => {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        
        blobs.forEach((blob, index) => {
            const speed = (index + 1) * 20;
            const xOffset = (window.innerWidth / 2 - e.pageX) / speed;
            const yOffset = (window.innerHeight / 2 - e.pageY) / speed;
            
            blob.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
        });

        if (heroShowcase) {
            const rotateX = (y - 0.5) * 10; // Max rotation 5deg
            const rotateY = (x - 0.5) * -10; // Max rotation 5deg
            heroShowcase.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        }
    });

    // Reset showcase rotation on mouse leave
    document.addEventListener('mouseleave', () => {
        if (heroShowcase) {
            heroShowcase.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
            heroShowcase.style.transition = 'transform 0.5s ease-out';
        }
        
        blobs.forEach(blob => {
            blob.style.transform = `translate(0px, 0px)`;
            blob.style.transition = 'transform 0.5s ease-out';
        });
    });

    // Remove transition when moving to avoid lag
    document.addEventListener('mouseenter', () => {
        if (heroShowcase) {
            heroShowcase.style.transition = 'transform 0.1s linear';
        }
        blobs.forEach(blob => {
            blob.style.transition = 'transform 0.1s linear';
        });
    });
});
