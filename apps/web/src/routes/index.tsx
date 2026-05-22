import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { authApi, habitsApi } from '../lib/apiClient';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function useHealthQuery(service: 'auth' | 'habits') {
  const client = service === 'auth' ? authApi : habitsApi;
  return useQuery({
    queryKey: [service, 'health'],
    queryFn: async () => {
      const response = await client(`/${service}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      return response.json();
    },
  });
}

function HealthSection({
  title,
  query,
}: {
  title: string;
  query: ReturnType<typeof useHealthQuery>;
}) {
  if (query.isLoading) {
    return (
      <section className="mt-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p>Checking…</p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="mt-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p>Error: {query.error instanceof Error ? query.error.message : 'Unknown error'}</p>
      </section>
    );
  }

  return (
    <section className="mt-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <pre className="mt-2 rounded bg-gray-100 p-2 text-sm">
        {JSON.stringify(query.data, null, 2)}
      </pre>
    </section>
  );
}

function HomePage() {
  const authHealth = useHealthQuery('auth');
  const habitsHealth = useHealthQuery('habits');

  return (
    <div>
      <HealthSection title="auth-api health" query={authHealth} />
      <HealthSection title="habits-api health" query={habitsHealth} />
    </div>
  );
}
