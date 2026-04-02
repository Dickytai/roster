import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { OnCallSchedule } from './types';

export function generatePdf(schedule: OnCallSchedule): void {
  const doc = new jsPDF();
  const { year, publicHolidays, staff, entries, phWeekendsCount } = schedule;

  // Title
  doc.setFontSize(18);
  doc.text(`Nurse Roster - ${year}`, 14, 20);

  doc.setFontSize(10);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 28);

  // Summary statistics
  doc.setFontSize(14);
  doc.text('Summary', 14, 40);

  const summaryData = staff.map(s => [
    s.name,
    String(phWeekendsCount[s.id] || 0),
    String(entries.filter(e => e.onCallStaffId === s.id).length),
  ]);

  autoTable(doc, {
    startY: 45,
    head: [['Staff', 'PH Weekends', 'Total Days']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [66, 66, 66] },
  });

  // Monthly rosters
  let yPos = (doc as any).lastAutoTable.finalY + 15;

  for (let month = 1; month <= 12; month++) {
    const monthEntries = entries.filter(e => {
      const date = new Date(e.date);
      return date.getMonth() + 1 === month;
    });

    if (monthEntries.length === 0) continue;

    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    doc.text(monthNames[month - 1], 14, yPos);

    const tableData = monthEntries.map(e => [
      e.date,
      getDayName(e.dayOfWeek),
      e.onCallStaffName || '-',
      e.phName || '-',
    ]);

    autoTable(doc, {
      startY: yPos + 5,
      head: [['Date', 'Day', 'On-Call', 'PH']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [100, 100, 100] },
      styles: { fontSize: 8 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Public Holidays section
  if (yPos > 200) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(12);
  doc.text('Public Holidays', 14, yPos);

  const holidayData = publicHolidays.map(ph => [ph.date, ph.name]);

  autoTable(doc, {
    startY: yPos + 5,
    head: [['Date', 'Holiday']],
    body: holidayData,
    theme: 'striped',
    headStyles: { fillColor: [66, 66, 66] },
  });

  // Save
  doc.save(`roster-${year}.pdf`);
}

function getDayName(dayOfWeek: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
}
