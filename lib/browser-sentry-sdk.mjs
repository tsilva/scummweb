// Keep the deferred chunk limited to the APIs the application uses. Passing
// the package's entire namespace through callbacks prevents tree shaking.
export { init, captureException, captureMessage, captureRouterTransitionStart, withScope } from "@sentry/nextjs";
