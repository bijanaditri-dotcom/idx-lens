import { lazy, Suspense, type ComponentType } from 'react';

/** Browser-only adapter for the existing dashboard's next/dynamic chart imports. */
export default function dynamic<P extends object>(
  loader: () => Promise<ComponentType<P>>,
  options: { ssr?: boolean; loading?: ComponentType } = {},
) {
  const Component = lazy(async () => ({ default: await loader() }));
  const Loading = options.loading;
  return function LazyDashboardPart(props: P) {
    return <Suspense fallback={Loading ? <Loading /> : null}><Component {...props} /></Suspense>;
  };
}
