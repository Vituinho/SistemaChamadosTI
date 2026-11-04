import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewTicketForm } from "@/features/new-ticket/new-ticket-form";
import { Timeline } from "@/features/tickets/timeline";
import { PriorityBadge, StatusBadge } from "@/features/tickets/badges";
import { listSavedTickets } from "@/features/tracking/saved-tickets";

const push = vi.fn();
const searchParams = new URLSearchParams("");
const router = { push, replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
  usePathname: () => "/chamado",
}));

const catalog = {
  departments: ["Faturamento", "Financeiro", "Juridico"],
  states: ["PR", "SP"],
  categories: ["Computador", "Internet", "Sistema", "Outro"],
  systems: ["DBFrete", "Frete Brás"],
  statuses: [],
  priorities: ["BAIXA", "NORMAL", "ALTA", "URGENTE"],
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("NewTicketForm", () => {
  beforeEach(() => push.mockReset());

  it("shows an accessible error summary instead of submitting an incomplete form", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(catalog));
    const user = userEvent.setup();
    renderWithClient(<NewTicketForm />);
    await user.click(await screen.findByRole("button", { name: "Enviar chamado" }));
    const summary = await screen.findByText(/Faltam 6 informações/);
    expect(summary.closest("[aria-live]")).toHaveFocus();
    expect(screen.getByLabelText("Seu nome")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the catalog
  });

  it("submits a complete ticket, saves it on this computer and opens tracking", async () => {
    const created = { id: 7, protocol: "GV-000007", access_key: "k".repeat(43), title: "Computador não liga", created_at: "2026-11-04T10:00:00Z" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => (String(input).endsWith("/catalog") ? json(catalog) : json(created, 201)));
    const user = userEvent.setup();
    renderWithClient(<NewTicketForm />);
    await user.click(await screen.findByRole("radio", { name: /Computador/ }));
    await user.click(screen.getByRole("button", { name: "Computador não liga" }));
    await user.type(screen.getByLabelText("Seu nome"), "Ana Souza");
    await user.selectOptions(screen.getByLabelText("Estado"), "PR");
    await user.click(screen.getByRole("radio", { name: "Jurídico" }));
    await user.type(screen.getByLabelText("Onde você está?"), "Sala 3");
    await user.click(screen.getByRole("button", { name: "Enviar chamado" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/acompanhar/?protocol=GV-000007#${"k".repeat(43)}`));
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/tickets"))!;
    const body = init!.body as FormData;
    expect(body.get("department")).toBe("Juridico");
    expect(body.get("title")).toBe("Computador não liga");
    expect(body.has("affected_system")).toBe(false);
    expect(listSavedTickets()[0]).toMatchObject({ protocol: "GV-000007", title: "Computador não liga" });
    expect(JSON.parse(localStorage.getItem("givova.requester.v1")!)).toMatchObject({ name: "Ana Souza", location: "Sala 3" });
  });

  it("keeps the data and explains API failures", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async input =>
      String(input).endsWith("/catalog") ? json(catalog) : json({ detail: "A imagem deve ter até 5 MB." }, 413),
    );
    const user = userEvent.setup();
    renderWithClient(<NewTicketForm />);
    await user.click(await screen.findByRole("radio", { name: /Internet/ }));
    await user.type(screen.getByLabelText("Resumo do problema"), "Sem rede");
    await user.type(screen.getByLabelText("Seu nome"), "Ana");
    await user.selectOptions(screen.getByLabelText("Estado"), "SP");
    await user.click(screen.getByRole("radio", { name: "Financeiro" }));
    await user.type(screen.getByLabelText("Onde você está?"), "Recepção");
    await user.click(screen.getByRole("button", { name: "Enviar chamado" }));
    expect(await screen.findByText(/A imagem deve ter até 5 MB/)).toBeInTheDocument();
    expect(screen.getByLabelText("Resumo do problema")).toHaveValue("Sem rede");
    expect(push).not.toHaveBeenCalled();
  });

  it("offers a retry when the catalog cannot be loaded", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    renderWithClient(<NewTicketForm />);
    expect(await screen.findByText("Não conseguimos carregar o formulário")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeEnabled();
  });
});

describe("ticket presentation components", () => {
  it("badges convey status and priority with text, not only colour", () => {
    render(<><StatusBadge status="AGUARDANDO_USUARIO" /><PriorityBadge priority="URGENTE" /></>);
    expect(screen.getByText("Aguardando colaborador")).toBeInTheDocument();
    expect(screen.getByText("Urgente").parentElement).toHaveTextContent("Prioridade Urgente");
  });

  it("timeline renders technician messages distinctly and escapes content", () => {
    render(
      <Timeline
        entries={[
          { id: 1, message: "Chamado criado — aguardando TI", created_at: "2026-11-04T10:00:00Z", kind: "event", author: null },
          { id: 2, message: "<img src=x onerror=alert(1)>", created_at: "2026-11-04T10:05:00Z", kind: "note", author: "Ana" },
        ]}
        newestFirst
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Ana escreveu")).toBeInTheDocument();
    expect(within(items[0]).getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
