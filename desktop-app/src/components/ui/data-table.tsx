import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export type DataTableColumn<T> = {
  header: string;
  className?: string;
  cell: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyTitle: string;
  emptyDescription?: string;
  isLoading?: boolean;
};

export function DataTable<T>({ columns, rows, getRowKey, emptyTitle, emptyDescription, isLoading }: DataTableProps<T>) {
  if (isLoading) {
    return <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground"><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Loading…</div>;
  }

  if (rows.length === 0) {
    return <div className="flex min-h-40 flex-col items-center justify-center px-6 text-center"><p className="font-medium">{emptyTitle}</p>{emptyDescription && <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>}</div>;
  }

  return (
    <Table>
      <TableHeader className="bg-muted/40">
        <TableRow>{columns.map((column) => <TableHead key={column.header} className={column.className}>{column.header}</TableHead>)}</TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => <TableRow key={getRowKey(row)}>{columns.map((column) => <TableCell key={column.header} className={column.className}>{column.cell(row)}</TableCell>)}</TableRow>)}
      </TableBody>
    </Table>
  );
}
