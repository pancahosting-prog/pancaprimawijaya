import React from 'react';

interface RobotIllustrationProps {
  className?: string;
  size?: number;
}

export const RobotIllustration: React.FC<RobotIllustrationProps> = ({ className = '', size = 260 }) => {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Soft Glow behind robot */}
      <div 
        className="absolute rounded-full bg-white/5 blur-2xl animate-pulse pointer-events-none"
        style={{ width: size * 0.9, height: size * 0.9 }}
      />

      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 320 320" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 drop-shadow-[0_15px_25px_rgba(0,0,0,0.15)]"
      >
        <defs>
          <linearGradient id="robotBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>

          <linearGradient id="robotArmGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          <linearGradient id="robotVisorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#000000" />
            <stop offset="50%" stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#333333" />
          </linearGradient>

          <linearGradient id="robotEyeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          <linearGradient id="coreLightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#333333" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>

          <filter id="eyeGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* --- Antenna --- */}
        <path d="M160 82 V48" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
        <circle cx="160" cy="42" r="10" fill="#ffffff" filter="url(#eyeGlow)" />
        <circle cx="160" cy="42" r="5" fill="#e2e8f0" />

        {/* --- Left Arm (Waving Raised Up) --- */}
        <g className="origin-[100px_160px] animate-[wiggle_3s_ease-in-out_infinite]">
          {/* Upper Arm */}
          <path 
            d="M105 160 C90 140 65 110 50 90" 
            stroke="url(#robotArmGrad)" 
            strokeWidth="16" 
            strokeLinecap="round" 
          />
          {/* Forearm & Hand */}
          <path 
            d="M50 90 C45 80 48 70 58 68 C68 66 76 74 78 85" 
            fill="#ffffff" 
          />
          {/* Fingers / Mitt */}
          <circle cx="56" cy="74" r="11" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" />
          <circle cx="45" cy="80" r="7" fill="#e2e8f0" />
        </g>

        {/* --- Right Arm (Waving Raised Up) --- */}
        <g className="origin-[220px_160px] animate-[wiggle_3s_ease-in-out_infinite_reverse]">
          {/* Upper Arm */}
          <path 
            d="M215 160 C230 140 255 110 270 90" 
            stroke="url(#robotArmGrad)" 
            strokeWidth="16" 
            strokeLinecap="round" 
          />
          {/* Forearm & Hand */}
          <path 
            d="M270 90 C275 80 272 70 262 68 C252 66 244 74 242 85" 
            fill="#ffffff" 
          />
          {/* Fingers / Mitt */}
          <circle cx="264" cy="74" r="11" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" />
          <circle cx="275" cy="80" r="7" fill="#e2e8f0" />
        </g>

        {/* --- Ears / Audio Cones --- */}
        <rect x="86" y="112" width="14" height="36" rx="7" fill="#cbd5e1" />
        <rect x="220" y="112" width="14" height="36" rx="7" fill="#cbd5e1" />

        {/* --- Robot Head --- */}
        <rect 
          x="94" 
          y="78" 
          width="132" 
          height="104" 
          rx="38" 
          fill="url(#robotBodyGrad)" 
          stroke="#cbd5e1" 
          strokeWidth="3" 
        />

        {/* --- Visor Screen --- */}
        <rect 
          x="108" 
          y="94" 
          width="104" 
          height="64" 
          rx="22" 
          fill="url(#robotVisorGrad)" 
          stroke="#475569" 
          strokeWidth="2" 
        />

        {/* --- Friendly Expressive Eyes (Blue/Cyan Glowing Curved Arches) --- */}
        {/* Left Eye: Happy Arc */}
        <path 
          d="M125 128 C128 116 142 116 146 128" 
          stroke="url(#robotEyeGrad)" 
          strokeWidth="5" 
          strokeLinecap="round" 
          filter="url(#eyeGlow)" 
        />
        {/* Right Eye: Happy Arc */}
        <path 
          d="M174 128 C178 116 192 116 196 128" 
          stroke="url(#robotEyeGrad)" 
          strokeWidth="5" 
          strokeLinecap="round" 
          filter="url(#eyeGlow)" 
        />

        {/* Visor Glare highlight */}
        <path 
          d="M116 102 C130 98 170 98 198 104" 
          stroke="#ffffff" 
          strokeWidth="2" 
          strokeLinecap="round" 
          opacity="0.3" 
        />

        {/* Cute blush cheeks */}
        <circle cx="120" cy="142" r="5" fill="#f43f5e" opacity="0.4" />
        <circle cx="200" cy="142" r="5" fill="#f43f5e" opacity="0.4" />

        {/* --- Neck Joint --- */}
        <rect x="146" y="180" width="28" height="14" rx="5" fill="#94a3b8" />

        {/* --- Robot Body (Curved Oval Capsule) --- */}
        <path 
          d="M112 192 C112 192 135 186 160 186 C185 186 208 192 208 192 L216 260 C216 276 190 286 160 286 C130 286 104 276 104 260 Z" 
          fill="url(#robotBodyGrad)" 
          stroke="#cbd5e1" 
          strokeWidth="3" 
        />

        {/* Body Chest Panel Lines */}
        <path d="M126 210 Q160 216 194 210" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />

        {/* Chest Core Energy Reactor */}
        <circle cx="160" cy="240" r="16" fill="url(#coreLightGrad)" stroke="#ffffff" strokeWidth="2" filter="url(#eyeGlow)" />
        <circle cx="160" cy="240" r="8" fill="#ffffff" />

        {/* Floating Base shadow */}
        <ellipse cx="160" cy="305" rx="50" ry="8" fill="#000000" opacity="0.12" />
      </svg>
    </div>
  );
};
