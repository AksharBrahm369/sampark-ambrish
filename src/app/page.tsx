'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useAttendanceData } from '@/hooks/useAttendanceData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function Dashboard() {
  const [showClearDialog, setShowClearDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { master, history, masterFileName, saveMaster, clearMaster } = useAttendanceData();

  const handleClearMaster = () => {
    const success = clearMaster();
    if (success) {
      toast.success('Master data removed successfully');
      setShowClearDialog(false);
    } else {
      toast.error('Failed to remove master data');
    }
  };

  const mostRecentWeek = history[0];
  const presentThisWeek = mostRecentWeek
    ? mostRecentWeek.records.filter((r) => r.status === 'present').length
    : 0;
  const absentThisWeek = mostRecentWeek
    ? mostRecentWeek.records.filter((r) => r.status === 'absent').length
    : 0;
  const totalAmbrish = master.length;
  const attendanceRate = totalAmbrish
    ? ((presentThisWeek / totalAmbrish) * 100).toFixed(1)
    : '0.0';

  const normalizeMasterRows = (data: Record<string, string>[]) => {
    // Helper to clean column key names
    const cleanKey = (key: string): string => {
      return key
        .toLowerCase()
        .trim()
        .replace(/[\s_-]+/g, ''); // Remove spaces, underscores, hyphens
    };

    // Helper to detect if a value looks like a phone number
    const isPhoneNumber = (value: string): boolean => {
      return /^\d{7,}$/.test(value.replace(/\D/g, ''));
    };

    // Helper to detect if a value looks like a number/ID
    const isNumericId = (value: string): boolean => {
      return /^\d+$/.test(value.trim());
    };

    // Helper to detect if a value looks like a location/area
    const isAreaName = (value: string): boolean => {
      // If it contains spaces and common area keywords, likely an area
      return (
        value.length > 3 &&
        (value.includes('Nagar') ||
          value.includes('Wadi') ||
          value.includes('Village') ||
          value.includes('Road') ||
          value.includes('Area') ||
          value.includes('nagar') ||
          value.includes('wadi') ||
          value.includes('village') ||
          /\s/.test(value)) // Has spaces
      );
    };

    // Log first row to debug column structure
    if (data.length > 0) {
      console.log('📋 Excel/CSV Columns:', Object.keys(data[0]));
      console.log('📊 First Row Raw Data:', data[0]);
    }

    return data.map((row, rowIndex) => {
      const entries = Object.entries(row);
      const cleaned: {
        id: string;
        name: string;
        middleName: string;
        lastName: string;
        mobile: string;
        area: string;
      } = {
        id: '',
        name: '',
        middleName: '',
        lastName: '',
        mobile: '',
        area: '',
      };

      // Debug: Log all values from this row
      if (rowIndex === 0) {
        console.log('🔍 Row 1 Detailed Values:');
        entries.forEach(([k, v]) => {
          console.log(`  ${k}: "${v}"`);
        });
      }

      // First pass: Try to match columns by header name
      entries.forEach(([key, value]) => {
        const keyLower = cleanKey(key);
        const valueTrimmed = String(value ?? '').trim();

        if (!valueTrimmed) return; // Skip empty values

        if (
          keyLower === 'id' ||
          keyLower === 'srno' ||
          keyLower === 'serialno'
        ) {
          if (!cleaned.id) cleaned.id = valueTrimmed;
        } else if (
          keyLower.includes('middle')
        ) {
          if (!cleaned.middleName) cleaned.middleName = valueTrimmed;
        } else if (
          keyLower.includes('last') ||
          keyLower.includes('surname')
        ) {
          if (!cleaned.lastName) cleaned.lastName = valueTrimmed;
        } else if (
          keyLower.includes('name') ||
          keyLower.includes('first') ||
          keyLower.includes('ambrish') ||
          keyLower.includes('member')
        ) {
          if (!cleaned.name) cleaned.name = valueTrimmed;
        } else if (
          keyLower.includes('mobile') ||
          keyLower.includes('phone') ||
          keyLower.includes('contact')
        ) {
          if (!cleaned.mobile) cleaned.mobile = valueTrimmed;
        } else if (
          keyLower.includes('area') ||
          keyLower.includes('location') ||
          keyLower.includes('region') ||
          keyLower.includes('address')
        ) {
          if (!cleaned.area) cleaned.area = valueTrimmed;
        }
      });

      // Second pass: Intelligent detection if fields are still empty
      if (!cleaned.name || !cleaned.mobile || !cleaned.area) {
        entries.forEach(([colName, value]) => {
          const valueTrimmed = String(value ?? '').trim();
          if (!valueTrimmed) return;

          if (!cleaned.mobile && isPhoneNumber(valueTrimmed)) {
            cleaned.mobile = valueTrimmed;
          } else if (!cleaned.id && isNumericId(valueTrimmed) && valueTrimmed.length <= 4) {
            cleaned.id = valueTrimmed;
          } else if (!cleaned.area && isAreaName(valueTrimmed)) {
            cleaned.area = valueTrimmed;
          }
        });
      }

      // Third pass: If name is still empty, use any unmapped text column
      if (!cleaned.name || !cleaned.middleName || !cleaned.lastName) {
        entries.forEach(([colName, value]) => {
          const valueTrimmed = String(value ?? '').trim();
          const keyLower = cleanKey(colName);

          // Skip columns we already explicitly matched to mobile/area/id
          if (
            keyLower.includes('mobile') ||
            keyLower.includes('phone') ||
            keyLower.includes('contact') ||
            keyLower.includes('area') ||
            keyLower.includes('location') ||
            keyLower.includes('region') ||
            keyLower.includes('address') ||
            keyLower === 'id' ||
            keyLower === 'srno' ||
            keyLower === 'no' ||
            keyLower === 'serialno'
          ) {
            return;
          }

          // If it's an unrecognized text column, use it!
          if (valueTrimmed && !isPhoneNumber(valueTrimmed) && !isNumericId(valueTrimmed)) {
            // Assign to first empty name slot in order: (Name, Middle, Last)
            // But skip if it's already the explicitly matched one
            if (!cleaned.name && keyLower !== 'middlename' && keyLower !== 'lastname') {
              cleaned.name = valueTrimmed;
            } else if (!cleaned.middleName && valueTrimmed !== cleaned.name && valueTrimmed !== cleaned.lastName) {
              cleaned.middleName = valueTrimmed;
            } else if (!cleaned.lastName && valueTrimmed !== cleaned.name && valueTrimmed !== cleaned.middleName) {
              cleaned.lastName = valueTrimmed;
            }
          }
        });
      }

      // Auto-split full names into First/Middle/Last if Name is long and Middle/Last are empty
      if (cleaned.name && !cleaned.middleName && !cleaned.lastName && cleaned.name.includes(' ')) {
        const parts = cleaned.name.split(/\s+/).filter(Boolean);
        if (parts.length === 2) {
          cleaned.name = parts[0];
          cleaned.lastName = parts[1];
        } else if (parts.length >= 3) {
          cleaned.name = parts[0];
          cleaned.lastName = parts[parts.length - 1];
          cleaned.middleName = parts.slice(1, parts.length - 1).join(' ');
        }
      }

      if (rowIndex === 0) {
        console.log(`✅ Row 1 Parsed Result:`, cleaned);
      }

      return {
        id: cleaned.id || '',
        name: cleaned.name || '',
        middleName: cleaned.middleName || '',
        lastName: cleaned.lastName || '',
        mobile: cleaned.mobile || '',
        area: cleaned.area || '',
        status: 'present' as const,
      };
    });
  };

  const onMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv');
    const isXlsx = fileName.endsWith('.xlsx');

    if (!isCsv && !isXlsx) {
      toast.error('Please upload a valid .xlsx or .csv file');
      e.target.value = '';
      return;
    }

    let data: Record<string, string>[] = [];

    if (isCsv) {
      const text = await file.text();
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
      }) as Papa.ParseResult<Record<string, string>>;

      if (parsed.errors.length > 0) {
        toast.error('Failed to parse CSV file');
        e.target.value = '';
        return;
      }

      data = parsed.data;
    } else {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        toast.error('Uploaded file is empty or invalid');
        e.target.value = '';
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
        defval: '',
        raw: false,
      });
    }

    if (!data.length) {
      toast.error('Uploaded file is empty or invalid');
      e.target.value = '';
      return;
    }

    const normalized = normalizeMasterRows(data);
    const success = saveMaster(normalized as any, file.name);
    if (success) {
      toast.success(`Ambrish master loaded - ${normalized.length} records`);
    } else {
      toast.error('Storage full. Please delete old history records.');
    }

    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Dashboard
      </h1>

      <div className="grid grid-cols-1 gap-6 w-full">
        <Card className="w-full overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm">
          <CardHeader className="p-4 sm:p-6 pb-2">
            <CardTitle className="text-lg sm:text-xl font-semibold">Upload Ambrish XLSX / CSV</CardTitle>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Status: {master.length ? `${master.length} loaded` : 'Not loaded'}
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2 space-y-4">
            {master.length > 0 ? (
              <div className="flex flex-col items-center justify-center border border-emerald-100 dark:border-emerald-950 rounded-xl p-6 bg-emerald-50/40 dark:bg-emerald-950/10 text-center space-y-3">
                <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-emerald-600 dark:text-emerald-400">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                    Active Database Loaded Successfully
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    File: <span className="font-semibold text-gray-900 dark:text-gray-100">{masterFileName || 'ambrish_list.xlsx'}</span>
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                    {master.length} active records ready for attendance
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full max-w-md pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 relative cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={onMasterUpload}
                    className="hidden"
                  />
                  <Button
                    variant="destructive"
                    className="flex-1 font-medium"
                    onClick={() => setShowClearDialog(true)}
                  >
                    Remove Data
                  </Button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-800 hover:border-violet-500 dark:hover:border-violet-700 rounded-xl p-8 bg-gray-50/50 dark:bg-gray-950/20 cursor-pointer transition-all group duration-200">
                <div className="p-4 bg-white dark:bg-gray-950 rounded-full shadow-sm border border-gray-100 dark:border-gray-800 group-hover:scale-105 transition-transform text-gray-400 group-hover:text-violet-500">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="mt-4 text-center">
                  <span className="font-semibold text-gray-700 dark:text-gray-300 group-hover:text-violet-600 dark:group-hover:text-violet-400">
                    Click to upload
                  </span>
                  <span className="text-gray-500 dark:text-gray-400"> or drag & drop</span>
                  <p className="text-xs text-gray-400 mt-1.5 font-medium">Excel (.xlsx) or CSV (.csv) files only</p>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={onMasterUpload}
                  className="hidden"
                />
              </label>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 w-full">
        <Card>
          <CardHeader className="p-4 sm:py-6 text-center sm:text-left">
            <CardTitle className="text-sm sm:text-base text-gray-500">Total Ambrish</CardTitle>
            <div className="text-3xl font-bold">{totalAmbrish}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 sm:py-6 text-center sm:text-left">
            <CardTitle className="text-sm sm:text-base text-gray-500">Present (Latest)</CardTitle>
            <div className="text-3xl font-bold text-green-600">{presentThisWeek}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 sm:py-6 text-center sm:text-left">
            <CardTitle className="text-sm sm:text-base text-gray-500">Absent (Latest)</CardTitle>
            <div className="text-3xl font-bold text-red-600">{absentThisWeek}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 sm:py-6 text-center sm:text-left">
            <CardTitle className="text-sm sm:text-base text-gray-500">Attendance %</CardTitle>
            <div className="text-3xl font-bold">{attendanceRate}%</div>
          </CardHeader>
        </Card>
      </div>

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Master Data</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all {master.length} Ambrish records? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearMaster}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
