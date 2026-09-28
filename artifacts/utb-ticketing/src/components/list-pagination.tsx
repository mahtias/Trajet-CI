import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";

interface ListPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// Always shown (even with a single page) so every admin table has the same footer
export function ListPagination({ page, totalPages, onPageChange }: ListPaginationProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <p className="text-sm text-muted-foreground">
        Page {page} sur {totalPages}
      </p>
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : ""}
              onClick={(e) => {
                e.preventDefault();
                if (page > 1) onPageChange(page - 1);
              }}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={page >= totalPages}
              className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
              onClick={(e) => {
                e.preventDefault();
                if (page < totalPages) onPageChange(page + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
