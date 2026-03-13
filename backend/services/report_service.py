import os
import csv
import time
import logging
import glob
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak
)

logger = logging.getLogger("itms.report_service")


def _find_latest_report_folder() -> str:
    """Find the most recent report folder under ~/Desktop/report/."""
    report_root = os.path.join(os.path.expanduser("~/Desktop"), "report")
    if not os.path.isdir(report_root):
        raise ValueError(f"No report directory found at {report_root}")
    
    folders = [
        os.path.join(report_root, d)
        for d in os.listdir(report_root)
        if os.path.isdir(os.path.join(report_root, d))
    ]
    if not folders:
        raise ValueError("No session folders found in ~/Desktop/report/")
    
    # Sort by modification time, most recent first
    folders.sort(key=os.path.getmtime, reverse=True)
    return folders[0]


class ReportGenerator:
    """Generates a PDF report purely from the files in a report folder."""

    def generate_folder_report(self, folder_path: str = None) -> str:
        """Generate PDF from a report folder.

        If folder_path is None, automatically finds the latest folder
        under ~/Desktop/report/.
        """
        if not folder_path:
            folder_path = _find_latest_report_folder()

        if not os.path.isdir(folder_path):
            raise ValueError(f"Report folder not found: {folder_path}")

        folder_name = os.path.basename(folder_path)
        report_path = os.path.join(folder_path, f"Inspection_Report_{folder_name}.pdf")

        doc = SimpleDocTemplate(report_path, pagesize=letter)
        styles = getSampleStyleSheet()
        elements = []

        # ── Title ──
        title_style = ParagraphStyle('ReportTitle', parent=styles['Heading1'], alignment=1)
        elements.append(Paragraph("Railway Inspection Report", title_style))
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(f"Session: {folder_name}", styles['Heading2']))
        elements.append(Spacer(1, 4))
        elements.append(Paragraph(
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            styles['Normal']
        ))
        elements.append(Spacer(1, 20))

        # ── 1. Session Info ──
        elements.append(Paragraph("1. Session Information", styles['Heading2']))
        files_in_folder = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]

        info_data = [
            ["Parameter", "Value"],
            ["Session Folder", folder_name],
            ["Files Count", str(len(files_in_folder))],
            ["Generated At", datetime.now().strftime('%Y-%m-%d %H:%M:%S')],
        ]
        t = Table(info_data, colWidths=[140, 320])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#f0f4f8')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 20))

        # ── 2. Defect Detection Report ──
        elements.append(Paragraph("2. Condition Monitoring — Defect Detections", styles['Heading2']))
        defects = self._read_defects_csv(folder_path)
        if defects:
            elements.append(Paragraph(
                f"Total defects detected: <b>{len(defects)}</b>", styles['Normal']
            ))
            elements.append(Spacer(1, 8))

            defect_table_data = [["#", "Time", "Chainage (m)", "Defect Class", "Confidence"]]
            for i, d in enumerate(defects[:100], 1):
                defect_table_data.append([
                    str(i), d['time'], d['chainage'], d['defect_class'], d['confidence']
                ])

            t_def = Table(defect_table_data, colWidths=[30, 70, 80, 160, 70])
            t_def.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8b0000')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 4),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fff5f5')]),
            ]))
            elements.append(t_def)
        else:
            elements.append(Paragraph("No defects detected during this session.", styles['Normal']))
        elements.append(Spacer(1, 16))

        # ── 3. Defect Snapshots ──
        snapshots = self._get_defect_snapshots(folder_path)
        if snapshots:
            elements.append(PageBreak())
            elements.append(Paragraph("3. Defect Snapshots", styles['Heading2']))
            elements.append(Paragraph(
                f"Unique snapshots: <b>{len(snapshots)}</b>", styles['Normal']
            ))
            elements.append(Spacer(1, 10))
            for snap_path in snapshots:
                snap_name = os.path.basename(snap_path)
                elements.append(Paragraph(f"<i>{snap_name}</i>", styles['Normal']))
                try:
                    elements.append(Image(snap_path, width=420, height=280))
                except Exception:
                    elements.append(Paragraph("[Image could not be loaded]", styles['Normal']))
                elements.append(Spacer(1, 14))

        # ── 4. Infringement Data (Lidar Clearances) ──
        infringement_data = self._read_infringement_csv(folder_path)
        if infringement_data:
            elements.append(PageBreak())
            elements.append(Paragraph("4. Structure Clearance — Infringement Data", styles['Heading2']))
            elements.append(Paragraph(
                f"Total readings: <b>{len(infringement_data)}</b>", styles['Normal']
            ))
            elements.append(Spacer(1, 8))

            # Summary: count UML/PML/CBML
            from collections import Counter
            c1_counts = Counter(d['class_1'] for d in infringement_data)
            c2_counts = Counter(d['class_2'] for d in infringement_data)
            c3_counts = Counter(d['class_3'] for d in infringement_data)

            cls_summary = [
                ["Sensor", "UML (Red)", "PML (Yellow)", "CBML (Green)", "Total"],
                ["Lidar 1 (Left)", str(c1_counts.get('UML', 0)), str(c1_counts.get('PML', 0)),
                 str(c1_counts.get('CBML', 0)), str(len(infringement_data))],
                ["Lidar 2 (Right)", str(c2_counts.get('UML', 0)), str(c2_counts.get('PML', 0)),
                 str(c2_counts.get('CBML', 0)), str(len(infringement_data))],
                ["Lidar 3 (Top)", str(c3_counts.get('UML', 0)), str(c3_counts.get('PML', 0)),
                 str(c3_counts.get('CBML', 0)), str(len(infringement_data))],
            ]
            t_inf = Table(cls_summary, colWidths=[100, 80, 80, 80, 60])
            t_inf.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 5),
                # Color UML cells red, PML yellow
                ('TEXTCOLOR', (1, 1), (1, -1), colors.HexColor('#cc0000')),
                ('TEXTCOLOR', (2, 1), (2, -1), colors.HexColor('#cc8800')),
                ('TEXTCOLOR', (3, 1), (3, -1), colors.HexColor('#008800')),
            ]))
            elements.append(t_inf)
            elements.append(Spacer(1, 12))

            # Lidar distance stats
            l1_vals = [float(d['l1']) for d in infringement_data if d['l1']]
            l2_vals = [float(d['l2']) for d in infringement_data if d['l2']]
            l3_vals = [float(d['l3']) for d in infringement_data if d['l3']]

            if l1_vals:
                lidar_stats = [
                    ["Sensor", "Min (m)", "Max (m)", "Mean (m)"],
                    ["Lidar 1", f"{min(l1_vals):.3f}", f"{max(l1_vals):.3f}", f"{np.mean(l1_vals):.3f}"],
                    ["Lidar 2", f"{min(l2_vals):.3f}", f"{max(l2_vals):.3f}", f"{np.mean(l2_vals):.3f}"],
                    ["Lidar 3", f"{min(l3_vals):.3f}", f"{max(l3_vals):.3f}", f"{np.mean(l3_vals):.3f}"],
                ]
                t_ls = Table(lidar_stats, colWidths=[80, 80, 80, 80])
                t_ls.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5276')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                    ('PADDING', (0, 0), (-1, -1), 5),
                ]))
                elements.append(t_ls)
                elements.append(Spacer(1, 12))

            # Lidar chart
            chart = self._generate_infringement_chart(folder_path, infringement_data)
            if chart:
                elements.append(Image(chart, width=480, height=200))
                elements.append(Spacer(1, 8))

        # ── 5. Acceleration Data ──
        accel_path = os.path.join(folder_path, "acceleration.xlsx")
        if os.path.exists(accel_path):
            elements.append(PageBreak())
            elements.append(Paragraph("5. Acceleration Data", styles['Heading2']))
            accel_data = self._read_acceleration_xlsx(accel_path)
            if accel_data:
                elements.append(Paragraph(
                    f"Data points: <b>{len(accel_data)}</b>", styles['Normal']
                ))
                elements.append(Spacer(1, 8))

                ax_vals = [d['ax'] for d in accel_data if d['ax'] is not None]
                ay_vals = [d['ay'] for d in accel_data if d['ay'] is not None]
                az_vals = [d['az'] for d in accel_data if d['az'] is not None]

                if ax_vals:
                    accel_stats = [
                        ["Axis", "Min", "Max", "Mean", "Std Dev"],
                        ["Acc X", f"{min(ax_vals):.4f}", f"{max(ax_vals):.4f}",
                         f"{np.mean(ax_vals):.4f}", f"{np.std(ax_vals):.4f}"],
                        ["Acc Y", f"{min(ay_vals):.4f}", f"{max(ay_vals):.4f}",
                         f"{np.mean(ay_vals):.4f}", f"{np.std(ay_vals):.4f}"],
                        ["Acc Z", f"{min(az_vals):.4f}", f"{max(az_vals):.4f}",
                         f"{np.mean(az_vals):.4f}", f"{np.std(az_vals):.4f}"],
                    ]
                    t_acc = Table(accel_stats, colWidths=[60, 80, 80, 80, 80])
                    t_acc.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5276')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                        ('PADDING', (0, 0), (-1, -1), 5),
                    ]))
                    elements.append(t_acc)
                    elements.append(Spacer(1, 12))

                    chart = self._generate_accel_chart(folder_path, ax_vals, ay_vals, az_vals)
                    if chart:
                        elements.append(Image(chart, width=480, height=200))
                        elements.append(Spacer(1, 8))

                    # Defect status breakdown
                    statuses = [d['status'] for d in accel_data if d['status']]
                    if statuses:
                        counts = Counter(statuses)
                        status_data = [["Status", "Count", "Percentage"]]
                        total = len(statuses)
                        for status, count in sorted(counts.items()):
                            pct = (count / total) * 100
                            status_data.append([status, str(count), f"{pct:.1f}%"])
                        t_status = Table(status_data, colWidths=[120, 80, 100])
                        t_status.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                            ('PADDING', (0, 0), (-1, -1), 5),
                        ]))
                        elements.append(Spacer(1, 12))
                        elements.append(Paragraph("Acceleration Defect Status:", styles['Heading3']))
                        elements.append(t_status)

        # ── 6. Session Files ──
        elements.append(PageBreak())
        elements.append(Paragraph("6. Session Files", styles['Heading2']))
        elements.append(Spacer(1, 8))

        file_list_data = [["File", "Size"]]
        for fname in sorted(os.listdir(folder_path)):
            fpath = os.path.join(folder_path, fname)
            if os.path.isfile(fpath):
                size_kb = os.path.getsize(fpath) / 1024
                if size_kb > 1024:
                    file_list_data.append([fname, f"{size_kb/1024:.1f} MB"])
                else:
                    file_list_data.append([fname, f"{size_kb:.1f} KB"])
            elif os.path.isdir(fpath):
                count = len(os.listdir(fpath))
                file_list_data.append([f"{fname}/", f"{count} files"])

        if len(file_list_data) > 1:
            t_files = Table(file_list_data, colWidths=[300, 100])
            t_files.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#333333')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 5),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
            ]))
            elements.append(t_files)

        # Build PDF
        doc.build(elements)
        logger.info(f"Report generated: {report_path}")
        return report_path

    # ── Helpers ──

    def _read_defects_csv(self, folder):
        csv_path = os.path.join(folder, "yolo_defects.csv")
        if not os.path.exists(csv_path):
            return []
        defects = []
        try:
            with open(csv_path, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    defects.append({
                        'time': row.get('Timestamp', ''),
                        'chainage': row.get('Chainage', ''),
                        'defect_class': row.get('Defect_Class', ''),
                        'confidence': row.get('Confidence', ''),
                    })
        except Exception as e:
            logger.error(f"Error reading defects CSV: {e}")
        return defects

    def _get_defect_snapshots(self, folder):
        snap_dir = os.path.join(folder, "defect_snapshots")
        if not os.path.isdir(snap_dir):
            return []
        return sorted(glob.glob(os.path.join(snap_dir, "*.jpg")))

    def _read_infringement_csv(self, folder):
        csv_path = os.path.join(folder, "infringement.csv")
        if not os.path.exists(csv_path):
            return []
        data = []
        try:
            with open(csv_path, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    data.append({
                        'timestamp': row.get('timestamp', ''),
                        'chainage': row.get('y', ''),
                        'l1': row.get('lidar1_m', ''),
                        'l2': row.get('lidar2_m', ''),
                        'l3': row.get('lidar3_m', ''),
                        'class_1': row.get('class_1', ''),
                        'class_2': row.get('class_2', ''),
                        'class_3': row.get('class_3', ''),
                    })
        except Exception as e:
            logger.error(f"Error reading infringement CSV: {e}")
        return data

    def _read_acceleration_xlsx(self, path):
        data = []
        try:
            from openpyxl import load_workbook
            wb = load_workbook(path, read_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(min_row=2, values_only=True))
            for row in rows:
                if len(row) >= 6:
                    data.append({
                        'time': row[0],
                        'chainage': row[1],
                        'ax': float(row[2]) if row[2] is not None else None,
                        'ay': float(row[3]) if row[3] is not None else None,
                        'az': float(row[4]) if row[4] is not None else None,
                        'status': row[5],
                    })
            wb.close()
        except Exception as e:
            logger.error(f"Error reading acceleration xlsx: {e}")
        return data

    def _generate_infringement_chart(self, folder, data):
        try:
            indices = range(len(data))
            l1 = [float(d['l1']) if d['l1'] else 0 for d in data]
            l2 = [float(d['l2']) if d['l2'] else 0 for d in data]
            l3 = [float(d['l3']) if d['l3'] else 0 for d in data]

            plt.figure(figsize=(10, 3.5))
            plt.plot(indices, l1, label='Lidar 1 (Left)', color='orange', linewidth=0.6, alpha=0.8)
            plt.plot(indices, l2, label='Lidar 2 (Right)', color='royalblue', linewidth=0.6, alpha=0.8)
            plt.plot(indices, l3, label='Lidar 3 (Top)', color='tomato', linewidth=0.6, alpha=0.8)
            plt.title("Structure Clearance Profile", fontsize=11, fontweight='bold')
            plt.xlabel("Sample #", fontsize=9)
            plt.ylabel("Distance (m)", fontsize=9)
            plt.grid(True, linestyle='--', alpha=0.5)
            plt.legend(fontsize=8)
            plt.tight_layout()
            path = os.path.join(folder, "chart_infringement.png")
            plt.savefig(path, dpi=120)
            plt.close()
            return path
        except Exception as e:
            logger.error(f"Chart error: {e}")
            plt.close()
            return None

    def _generate_accel_chart(self, folder, ax, ay, az):
        try:
            x = range(len(ax))
            plt.figure(figsize=(10, 3.5))
            plt.plot(x, ax, label='Acc X', color='tomato', linewidth=0.5, alpha=0.7)
            plt.plot(x, ay, label='Acc Y', color='mediumseagreen', linewidth=0.5, alpha=0.7)
            plt.plot(x, az, label='Acc Z', color='royalblue', linewidth=0.5, alpha=0.7)
            plt.title("Acceleration Profile", fontsize=11, fontweight='bold')
            plt.xlabel("Sample #", fontsize=9)
            plt.ylabel("Acceleration (m/s²)", fontsize=9)
            plt.grid(True, linestyle='--', alpha=0.5)
            plt.legend(fontsize=8)
            plt.tight_layout()
            path = os.path.join(folder, "chart_accel.png")
            plt.savefig(path, dpi=120)
            plt.close()
            return path
        except Exception as e:
            logger.error(f"Chart error: {e}")
            plt.close()
            return None


# Global singleton
report_gen = ReportGenerator()
