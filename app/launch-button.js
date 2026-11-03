export default function LaunchButton({ href, entryPoint, label = "Play", className = "" }) {
  const classes = ["launch-button", className].filter(Boolean).join(" ");

  return (
    <a className={classes} href={entryPoint ? `${href}?launch_from=${entryPoint}` : href}>
      {label}
    </a>
  );
}
