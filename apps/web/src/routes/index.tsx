import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await apiClient('/health');
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      return response.json();
    },
  });

  if (isLoading) {
    return <p>Checking backend health...</p>;
  }

  if (isError) {
    return <p>Error: {error instanceof Error ? error.message : 'Unknown error'}</p>;
  }

  return (
    <div>
      <h2 className="mt-4 text-lg font-semibold">Backend health</h2>
      <pre className="mt-2 rounded bg-gray-100 p-2 text-sm">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
