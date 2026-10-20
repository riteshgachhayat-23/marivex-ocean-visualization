
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./MarivexIntro.css";

type Props = {
  onEnter: () => void;
};

const story = [
  {
    label: "WELCOME TO MARIVEX",
    heading: "MARIVEX",
    accent: "Explore Beyond the Surface.",
    description:
      "An immersive ocean intelligence experience. Discover a new perspective on our planet's most complex and fascinating environment.",
    type: "welcome",
  },
  {
    label: "01 / THE CHALLENGE",
    heading: "An Ocean of Data.",
    accent: "A New Way to Understand It.",
    description:
      "Ocean datasets contain temperature, salinity, currents, depth, location and time. Understanding these dimensions through disconnected 2D tools can be challenging.",
    type: "problem",
  },
  {
    label: "02 / THE SOLUTION",
    heading: "One Ocean.",
    accent: "Infinite Perspectives.",
    description:
      "MARIVEX is designed to combine numerical ocean model outputs and in-situ observations within a unified browser-based 3D visualization environment.",
    type: "solution",
  },
  {
    label: "03 / BEGIN EXPLORATION",
    heading: "The Ocean Awaits.",
    accent: "Your Journey Begins Here.",
    description:
      "Experience our interactive prototype. Explore geographical locations, investigate marine parameters and discover the possibilities of 3D ocean visualization.",
    type: "enter",
  },
] as const;

function createEarthTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to create Earth texture");
  }

  const gradient = ctx.createLinearGradient(0, 0, 1024, 512);
  gradient.addColorStop(0, "#074c78");
  gradient.addColorStop(0.5, "#032e59");
  gradient.addColorStop(1, "#02152f");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);

  // Stylized continents on an equirectangular globe texture.
  const landmasses = [
    [
      [-168, 70], [-140, 72], [-125, 60], [-130, 50],
      [-120, 32], [-110, 28], [-97, 17], [-82, 10],
      [-80, 24], [-96, 35], [-82, 45], [-65, 52],
      [-80, 65], [-120, 72],
    ],
    [
      [-82, 12], [-67, 9], [-49, -2], [-38, -17],
      [-45, -35], [-70, -56], [-75, -34], [-81, -10],
    ],
    [
      [-12, 36], [5, 38], [32, 30], [45, 12],
      [39, -5], [28, -32], [15, -35], [10, -20],
      [-4, -3], [-17, 16],
    ],
    [
      [-12, 36], [-10, 54], [4, 60], [20, 55],
      [30, 60], [42, 53], [60, 55], [80, 58],
      [100, 52], [120, 53], [145, 45], [157, 59],
      [175, 61], [170, 40], [140, 26], [118, 12],
      [104, 2], [95, 10], [80, 7], [73, 22],
      [52, 26], [36, 33], [28, 41], [10, 36],
    ],
    [
      [113, -12], [130, -11], [153, -23],
      [145, -39], [115, -34],
    ],
    [
      [-53, 82], [-38, 80], [-42, 60], [-57, 60],
    ],
    [
      [47, -13], [50, -17], [49, -25],
      [44, -26],
    ],
  ];

  function toXY(longitude: number, latitude: number) {
    return {
      x: ((longitude + 180) / 360) * canvas.width,
      y: ((90 - latitude) / 180) * canvas.height,
    };
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(94, 232, 218, 0.7)";
  ctx.fillStyle = "#116f75";

  for (const land of landmasses) {
    ctx.beginPath();

    land.forEach(([lon, lat], index) => {
      const { x, y } = toXY(lon, lat);

      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Scientific latitude/longitude grid.
  ctx.strokeStyle = "rgba(100, 207, 245, 0.12)";
  ctx.lineWidth = 1;

  for (let x = 0; x < 1024; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  for (let y = 0; y < 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function OceanGlobe({
  active,
}: {
  active: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      45,
      1,
      0.1,
      100
    );

    camera.position.z = 5.7;

    scene.add(new THREE.AmbientLight(0x78bdf7, 2));

    const sunlight = new THREE.DirectionalLight(0xffffff, 3.5);
    sunlight.position.set(-3, 4, 6);
    scene.add(sunlight);

    const earthGeometry = new THREE.SphereGeometry(1.6, 96, 96);
    const earthTexture = createEarthTexture();

    const earthMaterial = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.85,
      metalness: 0.05,
      emissive: new THREE.Color("#08304b"),
      emissiveIntensity: 0.18,
    });

    const earth = new THREE.Mesh(
      earthGeometry,
      earthMaterial
    );

    earth.rotation.z = 0.12;
    scene.add(earth);

    const atmosphereGeometry = new THREE.SphereGeometry(
      1.68,
      64,
      64
    );

    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x32cfff,
      transparent: true,
      opacity: 0.075,
      side: THREE.BackSide,
      depthWrite: false,
    });

    const atmosphere = new THREE.Mesh(
      atmosphereGeometry,
      atmosphereMaterial
    );

    scene.add(atmosphere);

    const rings: THREE.Mesh[] = [];
    const ringMaterials: THREE.MeshBasicMaterial[] = [];
    const ringGeometries: THREE.TorusGeometry[] = [];

    for (let i = 0; i < 3; i++) {
      const geometry = new THREE.TorusGeometry(
        2.1 + i * 0.24,
        0.006 + i * 0.003,
        8,
        180
      );

      const material = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x72eeff : 0x167cad,
        transparent: true,
        opacity: i === 0 ? 0.6 : 0.33,
      });

      const ring = new THREE.Mesh(geometry, material);
      ring.rotation.x = 0.3 + i * 0.65;
      ring.rotation.y = i * 0.6;

      scene.add(ring);
      rings.push(ring);
      ringMaterials.push(material);
      ringGeometries.push(geometry);
    }

    // Distant light particles.
    const starPositions: number[] = [];

    for (let i = 0; i < 450; i++) {
      const x = (Math.random() - 0.5) * 25;
      const y = (Math.random() - 0.5) * 20;
      const z = -3 - Math.random() * 13;

      starPositions.push(x, y, z);
    }

    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(starPositions, 3)
    );

    const starsMaterial = new THREE.PointsMaterial({
      color: 0x82daf9,
      size: 0.035,
      transparent: true,
      opacity: 0.8,
    });

    const stars = new THREE.Points(
      starsGeometry,
      starsMaterial
    );

    scene.add(stars);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;

      if (!width || !height) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    const clock = new THREE.Clock();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    function animate() {
      frame = requestAnimationFrame(animate);

      const delta = Math.min(clock.getDelta(), 0.05);
      const phase = activeRef.current;

      if (!reducedMotion) {
        earth.rotation.y += delta * (0.09 + phase * 0.035);

        rings.forEach((ring, index) => {
          ring.rotation.z +=
            delta * (0.055 + index * 0.035);
        });
      }

      camera.position.z +=
        (phase === 3 ? 5.0 : 5.7) *
          0.025 -
        camera.position.z * 0.025;

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();

      scene.remove(earth, atmosphere, stars);
      earthGeometry.dispose();
      earthMaterial.dispose();
      earthTexture.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      starsGeometry.dispose();
      starsMaterial.dispose();

      rings.forEach((ring, index) => {
        scene.remove(ring);
        ringGeometries[index].dispose();
        ringMaterials[index].dispose();
      });

      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="mv-globe-canvas"
      aria-label="Animated 3D Earth"
      role="img"
    />
  );
}

export default function MarivexIntro({
  onEnter,
}: Props) {
  const [active, setActive] = useState(0);
  const [automatic, setAutomatic] = useState(true);
  const [leaving, setLeaving] = useState(false);

  const sectionsRef = useRef<(HTMLElement | null)[]>([]);
  const leavingRef = useRef(false);

  function goTo(index: number) {
    sectionsRef.current[index]?.scrollIntoView({
      behavior: window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  function enterExplorer() {
    if (leavingRef.current) return;

    leavingRef.current = true;
    setLeaving(true);

    window.setTimeout(() => {
      onEnter();
    }, 1200);
  }

  useEffect(() => {
    const elements = sectionsRef.current.filter(
      (element): element is HTMLElement => Boolean(element)
    );

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(
              entry.target.getAttribute("data-story-index")
            );

            setActive(index);
          }
        });
      },
      { threshold: 0.6 }
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (!automatic || reducedMotion || active >= 3) return;

    const timer = window.setTimeout(() => {
      goTo(active + 1);
    }, 5700);

    return () => window.clearTimeout(timer);
  }, [active, automatic]);

  useEffect(() => {
    const stopAutomatic = () => setAutomatic(false);

    window.addEventListener("wheel", stopAutomatic, {
      passive: true,
    });
    window.addEventListener("touchstart", stopAutomatic, {
      passive: true,
    });

    return () => {
      window.removeEventListener("wheel", stopAutomatic);
      window.removeEventListener("touchstart", stopAutomatic);
    };
  }, []);

  useEffect(() => {
    const oldHtmlOverflow =
      document.documentElement.style.overflowY;
    const oldBodyOverflow =
      document.body.style.overflowY;

    document.documentElement.style.overflowY = "auto";
    document.body.style.overflowY = "auto";

    window.scrollTo(0, 0);

    return () => {
      document.documentElement.style.overflowY =
        oldHtmlOverflow;
      document.body.style.overflowY =
        oldBodyOverflow;
    };
  }, []);

  return (
    <main
      className={`mv-experience ${
        leaving ? "mv-experience--leaving" : ""
      }`}
    >
      <div className="mv-space" aria-hidden="true" />

      <div className={`mv-world mv-world--${active}`}>
        <div className="mv-vortex" aria-hidden="true" />
        <OceanGlobe active={active} />
        <div className="mv-world__label">
          <span className="mv-live-dot" />
          MARIVEX · OCEAN EXPLORATION
        </div>
      </div>

      <header className="mv-header">
        <a
          href="#mv-section-0"
          className="mv-logo"
          onClick={() => {
            setAutomatic(false);
          }}
        >
          <span className="mv-logo__symbol">◈</span>
          MARIVEX
        </a>

        <div className="mv-header__right">
          <span>3D OCEAN INTELLIGENCE</span>
          <button
            type="button"
            className="mv-skip"
            onClick={enterExplorer}
          >
            Skip to Explorer ↗
          </button>
        </div>
      </header>

      <nav
        className="mv-dots"
        aria-label="Introduction sections"
      >
        {story.map((item, index) => (
          <button
            key={item.label}
            type="button"
            aria-label={`Go to ${item.label}`}
            aria-current={
              active === index ? "step" : undefined
            }
            className={
              active === index ? "mv-dot active" : "mv-dot"
            }
            onClick={() => {
              setAutomatic(false);
              goTo(index);
            }}
          />
        ))}
      </nav>

      <div className="mv-story">
        {story.map((item, index) => (
          <section
            key={item.label}
            id={`mv-section-${index}`}
            className={`mv-section mv-section--${item.type} ${
              active === index ? "mv-section--active" : ""
            }`}
            data-story-index={index}
            ref={(element) => {
              sectionsRef.current[index] = element;
            }}
          >
            <div className="mv-section__content">
              <div className="mv-eyebrow">
                <span className="mv-live-dot" />
                {item.label}
              </div>

              <h1 className="mv-title">
                {item.heading}
                <span>{item.accent}</span>
              </h1>

              <p className="mv-description">
                {item.description}
              </p>

              {index === 1 && (
                <div className="mv-feature-row">
                  <span>GEOGRAPHY</span>
                  <span>DEPTH</span>
                  <span>TIME</span>
                  <span>VARIABLES</span>
                </div>
              )}

              {index === 2 && (
                <div className="mv-capabilities">
                  <div>
                    <strong>01</strong>
                    <span>3D Model Fields</span>
                  </div>
                  <div>
                    <strong>02</strong>
                    <span>Depth & Time</span>
                  </div>
                  <div>
                    <strong>03</strong>
                    <span>Argo & Glider Integration</span>
                  </div>
                  <div>
                    <strong>04</strong>
                    <span>Scientific Visualization</span>
                  </div>
                </div>
              )}

              {index === 0 && (
                <button
                  className="mv-button"
                  type="button"
                  onClick={() => {
                    setAutomatic(false);
                    goTo(1);
                  }}
                >
                  Discover MARIVEX <span>↓</span>
                </button>
              )}

              {index === 3 && (
                <button
                  className="mv-button mv-button--launch"
                  type="button"
                  onClick={enterExplorer}
                >
                  Enter Ocean Explorer <span>↗</span>
                </button>
              )}

              {index !== 3 && (
                <div className="mv-section__hint">
                  {automatic
                    ? "THE JOURNEY CONTINUES AUTOMATICALLY"
                    : "SCROLL TO EXPLORE"}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="mv-bottom-status">
        <span>OCEANVISTA3D / MARIVEX</span>
        <span>
          {String(active + 1).padStart(2, "0")} / 04
        </span>
      </div>

      <div className="mv-exit-vortex" aria-hidden="true">
        <div className="mv-exit-vortex__ring" />
        <span>ENTERING MARIVEX</span>
      </div>
    </main>
  );
}
