export default function Icon({ name }) {
  const commonProps = {
    "aria-hidden": "true",
    className: "icon",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  switch (name) {
    case "info":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 10.2v5.1" />
          <path d="M12 7.7h.01" />
        </svg>
      );
    case "github":
      return (
        <svg
          {...commonProps}
          fill="currentColor"
          stroke="none"
          viewBox="0 0 24 24"
        >
          <path d="M12 2C6.48 2 2 6.58 2 12.22c0 4.51 2.87 8.33 6.84 9.68.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.21-3.37-1.21-.46-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.64-1.37-2.22-.26-4.56-1.15-4.56-5.1 0-1.13.39-2.05 1.04-2.78-.11-.26-.45-1.31.1-2.72 0 0 .85-.28 2.78 1.06A9.4 9.4 0 0 1 12 6.89c.85 0 1.71.12 2.51.36 1.93-1.34 2.78-1.06 2.78-1.06.55 1.41.21 2.46.1 2.72.65.73 1.04 1.65 1.04 2.78 0 3.96-2.35 4.84-4.59 5.09.36.32.69.94.69 1.91 0 1.38-.01 2.49-.01 2.83 0 .27.18.6.69.49A10.24 10.24 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z" />
        </svg>
      );
    default:
      return null;
  }
}
