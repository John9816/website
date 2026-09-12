import { useState, useCallback, KeyboardEvent } from 'react'

const ROWS = 6
const COLUMNS = 6

interface TableSizePickerProps {
  onSelect: (rows: number, columns: number) => void
}

export function TableSizePicker({ onSelect }: TableSizePickerProps) {
  const [preview, setPreview] = useState({ rows: 3, columns: 3 })

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>, row: number, column: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(row, column)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setPreview(p => ({ rows: Math.min(p.rows + 1, ROWS), columns: Math.min(p.columns + 1, COLUMNS) }))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setPreview(p => ({ rows: Math.max(p.rows - 1, 1), columns: Math.max(p.columns - 1, 1) }))
    }
  }, [onSelect])

  return (
    <div className="editor-table-picker" role="menu" aria-label="选择表格大小">
      <div className="editor-table-picker__header">
        <span>插入表格</span>
        <strong>{preview.rows} × {preview.columns}</strong>
      </div>
      <div className="editor-table-picker__grid" role="grid">
        {Array.from({ length: ROWS * COLUMNS }, (_, index) => {
          const row = Math.floor(index / COLUMNS) + 1
          const column = (index % COLUMNS) + 1
          const isActive = row <= preview.rows && column <= preview.columns

          return (
            <button
              key={`${row}-${column}`}
              type="button"
              role="gridcell"
              aria-label={`插入 ${row} 行 ${column} 列表格`}
              aria-selected={isActive}
              className={`editor-table-picker__cell ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelect(row, column)}
              onKeyDown={(e) => handleKeyDown(e, row, column)}
              tabIndex={0}
            />
          )
        })}
      </div>
    </div>
  )
}
