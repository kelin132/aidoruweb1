/**
 * Soft, multi-layered pastel gradient blur field used behind every screen.
 * Purely decorative; all values come from design tokens.
 */
export function AuroraField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />

      <div
        className="animate-aurora absolute -top-[22%] -left-[14%] h-[70vh] w-[70vh] rounded-full opacity-55 blur-[130px]"
        style={{ background: "radial-gradient(circle, var(--pastel-lilac), transparent 68%)" }}
      />
      <div
        className="animate-aurora absolute top-[8%] right-[-16%] h-[62vh] w-[62vh] rounded-full opacity-45 blur-[140px]"
        style={{
          background: "radial-gradient(circle, var(--neon-cyan), transparent 66%)",
          animationDelay: "-8s",
        }}
      />
      <div
        className="animate-aurora absolute bottom-[-22%] left-[18%] h-[76vh] w-[76vh] rounded-full opacity-40 blur-[150px]"
        style={{
          background: "radial-gradient(circle, var(--neon-pink), transparent 64%)",
          animationDelay: "-15s",
        }}
      />
      <div
        className="animate-aurora absolute bottom-[6%] right-[8%] h-[48vh] w-[48vh] rounded-full opacity-35 blur-[120px]"
        style={{
          background: "radial-gradient(circle, var(--pastel-mint), transparent 70%)",
          animationDelay: "-4s",
        }}
      />

      {/* fine grid */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--pastel-lilac) 1px, transparent 1px), linear-gradient(90deg, var(--pastel-lilac) 1px, transparent 1px)",
          backgroundSize: "68px 68px",
          maskImage: "radial-gradient(ellipse at 50% 20%, black, transparent 78%)",
        }}
      />

      {/* drifting motes */}
      {[
        { left: "12%", top: "28%", size: 6, delay: "0s" },
        { left: "78%", top: "18%", size: 4, delay: "-2s" },
        { left: "62%", top: "62%", size: 7, delay: "-4s" },
        { left: "28%", top: "74%", size: 5, delay: "-6s" },
        { left: "88%", top: "48%", size: 4, delay: "-1s" },
        { left: "42%", top: "12%", size: 5, delay: "-5s" },
      ].map((mote, i) => (
        <span
          key={i}
          className="animate-drift bg-pastel-mint absolute rounded-full blur-[1px]"
          style={{
            left: mote.left,
            top: mote.top,
            width: mote.size,
            height: mote.size,
            animationDelay: mote.delay,
          }}
        />
      ))}
    </div>
  );
}
