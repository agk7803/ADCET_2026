import os
import glob
import logging
from datetime import datetime
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

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
    """Generates a compact PDF report utilizing pandas for data processing."""

    def generate_folder_report(self, folder_path: str = None) -> str:
        if not folder_path:
            folder_path = _find_latest_report_folder()

        if not os.path.isdir(folder_path):
            raise ValueError(f"Report folder not found: {folder_path}")

        session_id = os.path.basename(folder_path)
        report_path = os.path.join(folder_path, "session_report.pdf")

        # Define styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('ReportTitle', parent=styles['Heading1'], alignment=1)
        h2_style = styles['Heading2']
        normal_style = styles['Normal']

        doc = SimpleDocTemplate(report_path, pagesize=letter)
        elements = []

        # ==========================================
        # 1. PAGE 1: Session Summary
        # ==========================================
        elements.append(Paragraph("Railway Inspection Summary", title_style))
        elements.append(Spacer(1, 10))
        elements.append(Paragraph(f"<b>Session ID:</b> {session_id}", normal_style))
        elements.append(Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", normal_style))
        elements.append(Spacer(1, 20))
        
        # Load and aggregate data using pandas
        yolo_path = os.path.join(folder_path, "yolo_defects.csv")
        inf_path = os.path.join(folder_path, "infringement.csv")
        acc_path = os.path.join(folder_path, "acceleration.xlsx")

        total_defects = 0
        df_defects = None
        if os.path.exists(yolo_path):
            try:
                df_defects = pd.read_csv(yolo_path)
                total_defects = len(df_defects)
            except Exception as e:
                logger.error(f"Error reading yolo_defects.csv: {e}")

        min_clearance = "N/A"
        class_counts = {"UML": 0, "PML": 0, "CBML": 0}
        df_inf = None
        if os.path.exists(inf_path):
            try:
                df_inf = pd.read_csv(inf_path)
                if not df_inf.empty:
                    # Minimum clearance over all lidars
                    lidar_cols = [c for c in ['lidar1_m', 'lidar2_m', 'lidar3_m'] if c in df_inf.columns]
                    if lidar_cols:
                        # Replace 0 with NaN so it doesn't count as actual clearance
                        df_lidar = df_inf[lidar_cols].replace(0.0, np.nan)
                        min_c = df_lidar.min().min()
                        if pd.notna(min_c):
                            min_clearance = f"{min_c:.3f} m"
                    
                    # Tally classifications
                    class_cols = [c for c in ['class_1', 'class_2', 'class_3'] if c in df_inf.columns]
                    for c_col in class_cols:
                        counts = df_inf[c_col].value_counts()
                        for cls_name in class_counts.keys():
                            class_counts[cls_name] += counts.get(cls_name, 0)
            except Exception as e:
                logger.error(f"Error reading infringement.csv: {e}")

        max_acc = "N/A"
        df_acc = None
        if os.path.exists(acc_path):
            try:
                # Assuming standard acceleration.xlsx layout
                df_acc = pd.read_excel(acc_path)
                if not df_acc.empty:
                    acc_cols = [col for col in df_acc.columns if 'acc' in col.lower() or 'ax' in col.lower() or 'ay' in col.lower() or 'az' in col.lower()]
                    # To find max magnitude we can look at the max absolute value across axes
                    if acc_cols:
                        max_val = df_acc[acc_cols].abs().max().max()
                        if pd.notna(max_val):
                            max_acc = f"{max_val:.3f} g"
            except Exception as e:
                logger.error(f"Error reading acceleration.xlsx: {e}")

        # Summary Table
        elements.append(Paragraph("Key Session Metrics", h2_style))
        summary_data = [
            ["Metric", "Value"],
            ["Total Defects Detected", str(total_defects)],
            ["Minimum Clearance Found", str(min_clearance)],
            ["Maximum Peak Acceleration", str(max_acc)],
            ["UML (Urgent) Clearances", str(class_counts["UML"])],
            ["PML (Planned) Clearances", str(class_counts["PML"])],
            ["CBML (Safe) Clearances", str(class_counts["CBML"])]
        ]
        
        t_sum = Table(summary_data, colWidths=[200, 150])
        t_sum.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5276')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f9f9f9')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
        ]))
        elements.append(t_sum)
        elements.append(PageBreak())

        # ==========================================
        # 2. PAGE 2: Defect Summary (Top 10)
        # ==========================================
        elements.append(Paragraph("Top 10 Defect Detections", h2_style))
        if df_defects is not None and not df_defects.empty:
            # Try to sort by Confidence
            conf_col = next((c for c in df_defects.columns if 'conf' in c.lower()), None)
            if conf_col:
                # Coerce to numeric just in case
                df_defects[conf_col] = pd.to_numeric(df_defects[conf_col], errors='coerce')
                top_defects = df_defects.sort_values(by=conf_col, ascending=False).head(10)
            else:
                top_defects = df_defects.head(10)

            # Map columns to output fields
            time_c = next((c for c in top_defects.columns if 'time' in c.lower()), 'N/A')
            chain_c = next((c for c in top_defects.columns if 'chainage' in c.lower()), 'N/A')
            label_c = next((c for c in top_defects.columns if 'class' in c.lower() or 'label' in c.lower()), 'N/A')
            
            defect_table_data = [["Timestamp", "Chainage", "Label", "Confidence"]]
            for _, row in top_defects.iterrows():
                t_val = str(row[time_c]) if time_c in row else "N/A"
                c_val = str(row[chain_c]) if chain_c in row else "N/A"
                l_val = str(row[label_c]) if label_c in row else "Undefined"
                conf_val = f"{row[conf_col]:.2f}" if conf_col and pd.notna(row[conf_col]) else "N/A"
                
                defect_table_data.append([t_val, c_val, l_val, conf_val])

            t_def = Table(defect_table_data, colWidths=[80, 80, 150, 80])
            t_def.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8b0000')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('PADDING', (0, 0), (-1, -1), 6),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
            ]))
            elements.append(t_def)
        else:
            elements.append(Paragraph("No defects detected or log file missing.", normal_style))

        elements.append(PageBreak())

        # ==========================================
        # 3. PAGE 3: Clearance and Vibration Charts
        # ==========================================
        elements.append(Paragraph("Structure Clearance Profile", h2_style))
        if df_inf is not None and not df_inf.empty:
            try:
                chart_inf_path = os.path.join(folder_path, "report_clearance_chart.png")
                plt.figure(figsize=(7, 3))
                
                # Get Lidar cols
                lcols = [c for c in ['lidar1_m', 'lidar2_m', 'lidar3_m'] if c in df_inf.columns]
                colors_lc = ['orange', 'royalblue', 'tomato']
                
                for idx, col in enumerate(lcols):
                    y_vals = df_inf[col].replace(0.0, np.nan)
                    x_vals = range(len(y_vals))
                    # Attempt to use chainage for X (column named 'y' or containing 'chain')
                    chain_cols = [c for c in df_inf.columns if c.lower() == 'y' or 'chain' in c.lower()]
                    if chain_cols:
                        x_vals = df_inf[chain_cols[0]]
                        
                    plt.plot(x_vals, y_vals, label=col, color=colors_lc[idx % 3], linewidth=0.8, alpha=0.8)

                plt.title("Clearance (m) vs Distance", fontsize=10, fontweight='bold')
                plt.ylabel("Clearance (m)", fontsize=9)
                plt.grid(True, linestyle='--', alpha=0.5)
                plt.legend(fontsize=8)
                plt.tight_layout()
                plt.savefig(chart_inf_path, dpi=120)
                plt.close()

                elements.append(Image(chart_inf_path, width=450, height=200))
                elements.append(Spacer(1, 15))
            except Exception as e:
                logger.error(f"Error plotting clearance: {e}")
                elements.append(Paragraph("Failed to generate clearance chart.", normal_style))
        else:
            elements.append(Paragraph("No infringement data available for chart.", normal_style))
            elements.append(Spacer(1, 15))


        elements.append(Paragraph("Vehicle Acceleration Profile", h2_style))
        if df_acc is not None and not df_acc.empty:
            try:
                chart_acc_path = os.path.join(folder_path, "report_accel_chart.png")
                plt.figure(figsize=(7, 3))
                
                ax_cols = [c for c in df_acc.columns if c.lower() in ['acc x', 'accx', 'ax']]
                ay_cols = [c for c in df_acc.columns if c.lower() in ['acc y', 'accy', 'ay']]
                az_cols = [c for c in df_acc.columns if c.lower() in ['acc z', 'accz', 'az']]
                
                chain_cols = [c for c in df_acc.columns if 'chainage' in c.lower() or c.lower() == 'y']
                x_vals = df_acc[chain_cols[0]] if chain_cols else range(len(df_acc))

                if ax_cols: plt.plot(x_vals, df_acc[ax_cols[0]], label="Acc X", color='tomato', linewidth=0.6, alpha=0.7)
                if ay_cols: plt.plot(x_vals, df_acc[ay_cols[0]], label="Acc Y", color='mediumseagreen', linewidth=0.6, alpha=0.7)
                if az_cols: plt.plot(x_vals, df_acc[az_cols[0]], label="Acc Z", color='royalblue', linewidth=0.6, alpha=0.7)

                plt.title("Acceleration (g) vs Distance", fontsize=10, fontweight='bold')
                plt.ylabel("Acceleration", fontsize=9)
                plt.grid(True, linestyle='--', alpha=0.5)
                plt.legend(fontsize=8)
                plt.tight_layout()
                plt.savefig(chart_acc_path, dpi=120)
                plt.close()

                elements.append(Image(chart_acc_path, width=450, height=200))
            except Exception as e:
                logger.error(f"Error plotting acceleration: {e}")
                elements.append(Paragraph("Failed to generate acceleration chart.", normal_style))
        else:
            elements.append(Paragraph("No acceleration data available for chart.", normal_style))

        # ==========================================
        # 4. PAGE 4: Key Evidence Images (Top 5)
        # ==========================================
        snap_dir = os.path.join(folder_path, "defect_snapshots")
        if os.path.isdir(snap_dir):
            snaps = sorted(glob.glob(os.path.join(snap_dir, "*.jpg")))
            if snaps:
                elements.append(PageBreak())
                elements.append(Paragraph("Key Evidence Snapshots", h2_style))
                elements.append(Paragraph("Displaying up to 5 representative snapshots.", normal_style))
                elements.append(Spacer(1, 10))
                
                # Take up to 5
                for snap_path in snaps[:5]:
                    snap_name = os.path.basename(snap_path)
                    try:
                        elements.append(Image(snap_path, width=320, height=200))
                        elements.append(Paragraph(f"<i>{snap_name}</i>", normal_style))
                        elements.append(Spacer(1, 15))
                    except Exception:
                        pass

        # Build PDF
        doc.build(elements)
        logger.info(f"Report generated: {report_path}")
        return report_path


# Global singleton
report_gen = ReportGenerator()
