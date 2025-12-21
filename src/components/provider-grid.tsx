"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Search, X, Check, Clock } from "lucide-react"

type CellStatus = "open" | "confirmed" | "pending" | "closed"

interface GridCell {
  status: CellStatus
  providerName?: string
  providerId?: string
}

interface ServiceRow {
  serviceType: string
  role: string
  positionCount: number
  shifts: GridCell[][] // [positionIndex][shiftIndex]
}

interface Provider {
  id: string
  name: string
  specialty: string
  credentials: string[]
  availability: "available" | "partial" | "unavailable"
}

const mockProviders: Provider[] = [
  { id: "1", name: "Jordan Smith", specialty: "Tele RN", credentials: ["RN", "BLS"], availability: "available" },
  { id: "2", name: "Jake Wilson", specialty: "Tele RN", credentials: ["RN", "BLS", "ACLS"], availability: "available" },
  { id: "3", name: "Jill Anderson", specialty: "Tele RN", credentials: ["RN", "BLS"], availability: "partial" },
  { id: "4", name: "Mary Lopez", specialty: "Tele RN", credentials: ["RN", "BLS"], availability: "available" },
  {
    id: "5",
    name: "Rick Johnson",
    specialty: "Tele NP",
    credentials: ["NP", "BLS", "ACLS"],
    availability: "available",
  },
  { id: "6", name: "Jim Davis", specialty: "Tele NP", credentials: ["NP", "BLS"], availability: "available" },
  { id: "7", name: "Roie Martinez", specialty: "Tele NP", credentials: ["NP", "BLS"], availability: "partial" },
  { id: "8", name: "May Chen", specialty: "Cath RN", credentials: ["RN", "BLS", "CATH"], availability: "available" },
  { id: "9", name: "Jak Brown", specialty: "Cath RN", credentials: ["RN", "BLS"], availability: "available" },
  { id: "10", name: "Ike White", specialty: "Cath RN", credentials: ["RN", "BLS"], availability: "available" },
]

const initialGridData: ServiceRow[] = [
  {
    serviceType: "TELE",
    role: "RN",
    positionCount: 4,
    shifts: [
      // Position 1: Friday AM (open), Friday PM (Jordan)
      [{ status: "open" }, { status: "confirmed", providerName: "Jordan M", providerId: "1" }],
      // Position 2: Friday AM (Jill), Friday PM (Jake)
      [
        { status: "confirmed", providerName: "Jill A", providerId: "3" },
        { status: "pending", providerName: "Jake W", providerId: "2" },
      ],
      // Position 3: Friday AM (Maryl), Friday PM (Jill)
      [
        { status: "confirmed", providerName: "Mary L", providerId: "4" },
        { status: "confirmed", providerName: "Jill A", providerId: "3" },
      ],
      // Position 4: Friday AM (open), Friday PM (Maryl)
      [{ status: "open" }, { status: "pending", providerName: "Mary L", providerId: "4" }],
    ],
  },
  {
    serviceType: "TELE",
    role: "NP",
    positionCount: 2,
    shifts: [
      // Position 1: Rick/Jim
      [
        { status: "confirmed", providerName: "Rick J", providerId: "5" },
        { status: "confirmed", providerName: "Jim D", providerId: "6" },
      ],
      // Position 2: open/Roie
      [{ status: "open" }, { status: "pending", providerName: "Roie M", providerId: "7" }],
    ],
  },
  {
    serviceType: "CATH",
    role: "RN",
    positionCount: 4,
    shifts: [
      // Position 1: May / CLOSED
      [{ status: "confirmed", providerName: "May C", providerId: "8" }, { status: "closed" }],
      // Position 2: Jak / CLOSED
      [{ status: "confirmed", providerName: "Jak B", providerId: "9" }, { status: "closed" }],
      // Position 3: Ike / CLOSED
      [{ status: "confirmed", providerName: "Ike W", providerId: "10" }, { status: "closed" }],
      // Position 4: Jim / CLOSED
      [{ status: "confirmed", providerName: "Jim D", providerId: "6" }, { status: "closed" }],
    ],
  },
  {
    serviceType: "CATH",
    role: "NP",
    positionCount: 5,
    shifts: [
      [{ status: "open" }, { status: "closed" }],
      [{ status: "open" }, { status: "closed" }],
      [{ status: "open" }, { status: "closed" }],
      [{ status: "open" }, { status: "closed" }],
      [{ status: "open" }, { status: "closed" }],
    ],
  },
]

interface ProviderGridProps {
  startDate?: Date
  onDragOver?: (serviceIndex: number, positionIndex: number, shiftIndex: number) => void
}

export function ProviderGrid({ startDate = new Date(2025, 0, 2) }: ProviderGridProps) {
  const [gridData, setGridData] = useState<ServiceRow[]>(initialGridData)
  const [selectedCell, setSelectedCell] = useState<{
    serviceIndex: number
    positionIndex: number
    shiftIndex: number
  } | null>(null)
  const [providerSearchQuery, setProviderSearchQuery] = useState("")
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [dragOverCell, setDragOverCell] = useState<{
    serviceIndex: number
    positionIndex: number
    shiftIndex: number
  } | null>(null)

  const getWeekDates = () => {
    const dates = []
    const baseDate = new Date(startDate)
    baseDate.setDate(baseDate.getDate() + weekOffset * 7)

    // Just showing 2 days for now (Friday, Saturday) as per the example
    for (let i = 0; i < 2; i++) {
      const date = new Date(baseDate)
      date.setDate(date.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  const weekDates = getWeekDates()

  const handleCellClick = (serviceIndex: number, positionIndex: number, shiftIndex: number) => {
    const cell = gridData[serviceIndex].shifts[positionIndex][shiftIndex]
    if (cell.status === "closed") return

    if (selectedProvider) {
      const provider = mockProviders.find((p) => p.id === selectedProvider)
      if (provider) {
        handleProviderAssign(provider, serviceIndex, positionIndex, shiftIndex)
        setSelectedProvider(null)
      }
      return
    }

    setSelectedCell({ serviceIndex, positionIndex, shiftIndex })
    setProviderSearchQuery("")
  }

  const handleProviderAssign = (
    provider: Provider,
    serviceIndex: number,
    positionIndex: number,
    shiftIndex: number,
  ) => {
    const newGridData = [...gridData]
    const cell = newGridData[serviceIndex].shifts[positionIndex][shiftIndex]

    const firstName = provider.name.split(" ")[0]
    const lastInitial = provider.name.split(" ")[1]?.[0] || ""

    cell.status = "pending"
    cell.providerName = `${firstName} ${lastInitial}`
    cell.providerId = provider.id

    setGridData(newGridData)
  }

  const handleProviderSelect = (provider: Provider) => {
    if (!selectedCell) return
    handleProviderAssign(provider, selectedCell.serviceIndex, selectedCell.positionIndex, selectedCell.shiftIndex)
    setSelectedCell(null)
  }

  const handleToggleStatus = () => {
    if (!selectedCell) return

    const newGridData = [...gridData]
    const cell = newGridData[selectedCell.serviceIndex].shifts[selectedCell.positionIndex][selectedCell.shiftIndex]

    if (cell.status === "pending") {
      cell.status = "confirmed"
    } else if (cell.status === "confirmed") {
      cell.status = "pending"
    }

    setGridData(newGridData)
    setSelectedCell(null)
  }

  const handleRemoveProvider = () => {
    if (!selectedCell) return

    const newGridData = [...gridData]
    const cell = newGridData[selectedCell.serviceIndex].shifts[selectedCell.positionIndex][selectedCell.shiftIndex]
    cell.status = "open"
    cell.providerName = undefined
    cell.providerId = undefined

    setGridData(newGridData)
    setSelectedCell(null)
  }

  const handleDragOver = (e: React.DragEvent, serviceIndex: number, positionIndex: number, shiftIndex: number) => {
    e.preventDefault()
    const cell = gridData[serviceIndex].shifts[positionIndex][shiftIndex]
    if (cell.status !== "closed") {
      setDragOverCell({ serviceIndex, positionIndex, shiftIndex })
    }
  }

  const handleDragLeave = () => {
    setDragOverCell(null)
  }

  const handleDrop = (e: React.DragEvent, serviceIndex: number, positionIndex: number, shiftIndex: number) => {
    e.preventDefault()
    const providerId = e.dataTransfer.getData("providerId")
    const provider = mockProviders.find((p) => p.id === providerId)

    if (provider) {
      handleProviderAssign(provider, serviceIndex, positionIndex, shiftIndex)
    }

    setDragOverCell(null)
  }

  const filteredProviders = mockProviders.filter(
    (provider) =>
      provider.name.toLowerCase().includes(providerSearchQuery.toLowerCase()) ||
      provider.specialty.toLowerCase().includes(providerSearchQuery.toLowerCase()),
  )

  const selectedCellData = selectedCell
    ? gridData[selectedCell.serviceIndex].shifts[selectedCell.positionIndex][selectedCell.shiftIndex]
    : null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset(weekOffset - 1)} className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Previous Week
        </Button>
        <h3 className="text-sm font-medium text-foreground">
          {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
          {weekDates[weekDates.length - 1].toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </h3>
        <Button variant="outline" size="sm" onClick={() => setWeekOffset(weekOffset + 1)} className="gap-2">
          Next Week
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto bg-slate-900">
        <div className="inline-block min-w-full">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="border border-slate-700 bg-slate-800 p-3 text-left text-xs font-semibold text-slate-300 w-48 sticky left-0 z-20">
                  SERVICE / ROLE
                </th>
                {weekDates.map((date, dayIndex) => (
                  <th
                    key={dayIndex}
                    colSpan={2}
                    className="border border-slate-700 bg-slate-800 p-3 text-center text-sm font-semibold text-slate-200"
                  >
                    <div className="uppercase tracking-wide">
                      {date.toLocaleDateString("en-US", { weekday: "long" })}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                <th className="border border-slate-700 bg-slate-800 p-2 sticky left-0 z-20"></th>
                {weekDates.map((_, dayIndex) => (
                  <>
                    <th
                      key={`${dayIndex}-am`}
                      className="border border-slate-700 bg-slate-800 p-2 text-center text-xs font-medium text-slate-400 w-32"
                    >
                      AM
                    </th>
                    <th
                      key={`${dayIndex}-pm`}
                      className="border border-slate-700 bg-slate-800 p-2 text-center text-xs font-medium text-slate-400 w-32"
                    >
                      PM
                    </th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridData.map((service, serviceIndex) => (
                <>
                  <tr key={`${serviceIndex}-header`} className="bg-slate-800/50">
                    <td
                      colSpan={weekDates.length * 2 + 1}
                      className="border border-slate-700 p-3 text-sm font-bold text-emerald-400 uppercase tracking-wide"
                    >
                      {service.serviceType} {service.role}
                    </td>
                  </tr>
                  {Array.from({ length: service.positionCount }).map((_, positionIndex) => (
                    <tr key={`${serviceIndex}-${positionIndex}`}>
                      <td className="border border-slate-700 bg-slate-800/30 p-2 text-xs text-slate-400 font-mono sticky left-0 z-10">
                        position {positionIndex + 1}
                      </td>
                      {weekDates.map((_, dayIndex) => {
                        const amShiftIndex = dayIndex * 2
                        const pmShiftIndex = dayIndex * 2 + 1

                        const amCell = service.shifts[positionIndex]?.[amShiftIndex] || { status: "open" as CellStatus }
                        const pmCell = service.shifts[positionIndex]?.[pmShiftIndex] || { status: "open" as CellStatus }

                        return (
                          <>
                            <td
                              key={`${dayIndex}-am`}
                              className="border border-slate-700 p-2 bg-slate-900"
                              onClick={() => handleCellClick(serviceIndex, positionIndex, amShiftIndex)}
                              onDragOver={(e) => handleDragOver(e, serviceIndex, positionIndex, amShiftIndex)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, serviceIndex, positionIndex, amShiftIndex)}
                            >
                              <GridCellDisplay
                                cell={amCell}
                                isDropTarget={
                                  dragOverCell?.serviceIndex === serviceIndex &&
                                  dragOverCell?.positionIndex === positionIndex &&
                                  dragOverCell?.shiftIndex === amShiftIndex
                                }
                              />
                            </td>
                            <td
                              key={`${dayIndex}-pm`}
                              className="border border-slate-700 p-2 bg-slate-900"
                              onClick={() => handleCellClick(serviceIndex, positionIndex, pmShiftIndex)}
                              onDragOver={(e) => handleDragOver(e, serviceIndex, positionIndex, pmShiftIndex)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, serviceIndex, positionIndex, pmShiftIndex)}
                            >
                              <GridCellDisplay
                                cell={pmCell}
                                isDropTarget={
                                  dragOverCell?.serviceIndex === serviceIndex &&
                                  dragOverCell?.positionIndex === positionIndex &&
                                  dragOverCell?.shiftIndex === pmShiftIndex
                                }
                              />
                            </td>
                          </>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={selectedCell !== null} onOpenChange={() => setSelectedCell(null)}>
        <DialogContent className="max-w-lg bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {selectedCellData?.status === "confirmed" || selectedCellData?.status === "pending"
                ? "Provider Assignment"
                : "Select Provider"}
            </DialogTitle>
          </DialogHeader>

          {selectedCellData?.status === "confirmed" || selectedCellData?.status === "pending" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Currently Assigned</p>
                    <p className="text-lg font-medium text-slate-100">{selectedCellData.providerName}</p>
                  </div>
                  <Badge
                    className={cn(
                      "text-xs",
                      selectedCellData.status === "confirmed" &&
                        "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                      selectedCellData.status === "pending" && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                    )}
                  >
                    {selectedCellData.status === "confirmed" ? (
                      <div className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Confirmed
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Pending
                      </div>
                    )}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleStatus}
                    className={cn(
                      "flex-1 gap-2",
                      selectedCellData.status === "confirmed"
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20",
                    )}
                  >
                    {selectedCellData.status === "confirmed" ? (
                      <>
                        <Clock className="h-4 w-4" />
                        Mark Pending
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Confirm
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveProvider}
                    className="gap-2 bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <X className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                {selectedCellData.status === "confirmed"
                  ? "This assignment is confirmed. You can mark it as pending or remove the provider."
                  : "This assignment is pending confirmation. Click confirm when the provider accepts."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search providers..."
                  value={providerSearchQuery}
                  onChange={(e) => setProviderSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-900 border-slate-700 text-slate-100"
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => handleProviderSelect(provider)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 p-3 text-left transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-100">{provider.name}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          provider.availability === "available" && "bg-green-500/20 text-green-400 border-green-500/30",
                          provider.availability === "partial" &&
                            "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                          provider.availability === "unavailable" && "bg-red-500/20 text-red-400 border-red-500/30",
                        )}
                      >
                        {provider.availability}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-400 mb-2">{provider.specialty}</p>
                    <div className="flex flex-wrap gap-1">
                      {provider.credentials.map((cred) => (
                        <Badge key={cred} variant="secondary" className="text-xs bg-slate-800 text-slate-300">
                          {cred}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GridCellDisplay({ cell, isDropTarget }: { cell: GridCell; isDropTarget?: boolean }) {
  if (cell.status === "closed") {
    return (
      <div className="h-14 w-full bg-slate-950 rounded flex items-center justify-center cursor-not-allowed">
        <div className="text-xs text-slate-700 font-bold tracking-wider">███████</div>
      </div>
    )
  }

  if (cell.status === "confirmed") {
    return (
      <div
        className={cn(
          "h-14 w-full bg-emerald-500/10 border border-emerald-500/30 rounded flex items-center justify-center cursor-pointer hover:bg-emerald-500/20 transition-colors group",
          isDropTarget && "ring-2 ring-emerald-400 bg-emerald-500/30",
        )}
      >
        <span className="text-sm font-medium text-emerald-300 truncate px-2 group-hover:text-emerald-200">
          {cell.providerName}
        </span>
      </div>
    )
  }

  if (cell.status === "pending") {
    return (
      <div
        className={cn(
          "h-14 w-full bg-amber-500/10 border border-amber-500/30 rounded flex items-center justify-center cursor-pointer hover:bg-amber-500/20 transition-colors group",
          isDropTarget && "ring-2 ring-amber-400 bg-amber-500/30",
        )}
      >
        <span className="text-sm font-medium text-amber-300 truncate px-2 group-hover:text-amber-200">
          {cell.providerName}
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "h-14 w-full bg-slate-800/50 border-2 border-dashed border-slate-600 rounded flex items-center justify-center cursor-pointer hover:border-emerald-500/50 hover:bg-slate-800 transition-colors group",
        isDropTarget && "border-emerald-500 bg-emerald-500/10",
      )}
    >
      <span className="text-xs text-slate-500 font-mono group-hover:text-emerald-400 transition-colors">[ ]</span>
    </div>
  )
}
