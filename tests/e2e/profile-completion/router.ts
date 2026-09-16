// TEST_ONLY navigation adapter; the real completion page and AuthProvider are mounted.
export const createFileRoute = () => (options: { component: () => unknown }) => ({ options });
const navigate = ({ to }: { to: string }) => {
  window.location.hash = to;
};
export const useNavigate = () => navigate;
