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

# Shared session context so we don't assume finding the newest folder by mtime
# but instead use the explicitly provided get_report_dir() if passed.
try:
    from backend.services.report_session import get_report_dir
except ImportError:
    get_report_dir = None

logger = logging.getLogger("itms.report_service")

class ReportGenerator:
    """Compact PDF report generator using pandas, exactly structured for specific charts."""

    def generate_folder_report(self, folder_path: str = None) -> str:
        print("\n--- INSIDE ReportGenerator.generate_folder_report ---")
        # 1. Use session folder
        if not folder_path:
            print("No folder_path passed, trying to get it manually or globally")
            if get_report_dir:
                folder_path = get_report_dir()
                print(f"Got folder from get_report_dir: {folder_path}")
            else:
                print("FAILED: Session directory not provided and get_report_dir is unavailable.")
                raise ValueError("Session directory not provided and get_report_dir is unavailable.")

        print(f"Verifying folder exists: {folder_path}")
        if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
            print(f"FAILED: Report folder not found: {folder_path}")
            raise ValueError(f"Report folder not found: {folder_path}")

        session_id = os.path.basename(folder_path)
        report_path = os.path.join(folder_path, f"session_report_{session_id}.pdf")
        print(f"Session ID: {session_id}")
        print(f"Target PDF Path: {report_path}")

        # Define styles
        print("Setting up PDF styles...")
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('ReportTitle', parent=styles['Heading1'], alignment=1)
        h2_style = styles['Heading2']
        normal_style = styles['Normal']

        doc = SimpleDocTemplate(report_path, pagesize=letter)
        elements = []

        # ==========================================
        # PAGE 1: Session Summary
        # ==========================================
        elements.append(Paragraph("Railway Inspection Summary", title_style))
        elements.append(Spacer(1, 10))
        elements.append(Paragraph(f"<b>Session ID:</b> {session_id}", normal_style))
        elements.append(Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", normal_style))
        elements.append(Spacer(1, 20))
        
        yolo_path = os.path.join(folder_path, "yolo_defects.csv")
        inf_path = os.path.join(folder_path, "infringement.csv")
        acc_path = os.path.join(folder_path, "acceleration.xlsx")
        # Fallbacks for acceleration
        if not os.path.exists(acc_path):
            acc_path = os.path.join(folder_path, "acceleration.csv")
        if not os.path.exists(acc_path):
            # Check for any .csv with 'acc' or 'serial' in name as last resort
            fallback_accs = glob.glob(os.path.join(folder_path, "*acc*.csv")) + glob.glob(os.path.join(folder_path, "*serial*.csv"))
            if fallback_accs:
                acc_path = fallback_accs[0]

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
                    lidar_cols = [c for c in ['lidar1_m', 'lidar2_m', 'lidar3_m'] if c in df_inf.columns]
                    if lidar_cols:
                        df_lidar = df_inf[lidar_cols].replace(0.0, np.nan)
                        min_c = df_lidar.min().min()
                        if pd.notna(min_c):
                            min_clearance = f"{min_c:.3f} m"
                    
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
                if acc_path.endswith('.xlsx'):
                    df_acc = pd.read_excel(acc_path)
                else:
                    df_acc = pd.read_csv(acc_path)
                    
                if not df_acc.empty:
                    acc_cols = [col for col in df_acc.columns if 'acc' in col.lower() or 'ax' in col.lower() or 'ay' in col.lower() or 'az' in col.lower()]
                    if acc_cols:
                        max_val = df_acc[acc_cols].abs().max().max()
                        if pd.notna(max_val):
                            max_acc = f"{max_val:.3f} m/s²"
            except Exception as e:
                logger.error(f"Error reading acceleration file {acc_path}: {e}")

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
            ['FONTSIZE', (0, 0), (-1, -1), 10],
        ]))
        elements.append(t_sum)
        elements.append(PageBreak())

        print("Completed Page 1 (Session Summary).")

        # ==========================================
        # PAGE 2: Defect Summary (Top 10)
        # ==========================================
        print("Starting Page 2 (Defect Summary)...")
        elements.append(Paragraph("Top 10 Defect Detections", h2_style))
        if df_defects is not None and not df_defects.empty:
            df_def_clean = df_defects.copy()
            
            label_c = next((c for c in df_def_clean.columns if 'class' in c.lower() or 'label' in c.lower()), None)
            time_c = next((c for c in df_def_clean.columns if 'time' in c.lower()), None)
            chain_c = next((c for c in df_def_clean.columns if 'chainage' in c.lower() or c.lower() == 'y'), None)
            conf_c = next((c for c in df_def_clean.columns if 'conf' in c.lower()), None)

            # Drop exact duplicates and sort
            df_def_clean.drop_duplicates(inplace=True)

            if conf_c:
                df_def_clean[conf_c] = pd.to_numeric(df_def_clean[conf_c], errors='coerce')
                
            # If multiple rows have the exact same chainage/label, pick the highest confidence
            if chain_c and label_c and conf_c:
                df_def_clean = df_def_clean.sort_values(conf_c, ascending=False).drop_duplicates(subset=[chain_c, label_c])

            # Sort by confidence
            if conf_c:
                top_defects = df_def_clean.sort_values(by=conf_c, ascending=False).head(10)
            else:
                top_defects = df_def_clean.head(10)

            defect_table_data = [["Timestamp", "Chainage (m)", "Label", "Confidence"]]
            for _, row in top_defects.iterrows():
                t_val = str(row[time_c]) if time_c else "N/A"
                c_val = f"{float(row[chain_c]):.2f}" if chain_c and pd.notna(row[chain_c]) else "N/A"
                l_val = str(row[label_c]) if label_c else "Undefined"
                conf_val = f"{row[conf_c]:.2f}" if conf_c and pd.notna(row[conf_c]) else "N/A"
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
        # PAGE 3: Clearance and Vibration Charts
        # ==========================================
        elements.append(Paragraph("Structure Clearance Profile", h2_style))
        if df_inf is not None and not df_inf.empty:
            try:
                # Need to plot vs chainage (y-column usually named 'y' or 'chainage')
                chain_c = next((c for c in df_inf.columns if c.lower() == 'y' or 'chain' in c.lower()), None)
                lcols = [c for c in ['lidar1_m', 'lidar2_m', 'lidar3_m'] if c in df_inf.columns]
                
                if chain_c and len(lcols) > 0:
                    df_chart = df_inf.dropna(subset=[chain_c]).copy()
                    
                    # Downsample if very dense (> 2000 points)
                    if len(df_chart) > 2000:
                        df_chart = df_chart.iloc[::(len(df_chart)//1000)]
                    
                    x_vals = df_chart[chain_c]
                    
                    # Avoid plot if only 1 unique X
                    if x_vals.nunique() > 1:
                        chart_inf_path = os.path.join(folder_path, "report_clearance_chart.png")
                        # Wide figure
                        plt.figure(figsize=(8, 3.5))
                        
                        colors_lc = ['orange', 'royalblue', 'green']
                        for idx, col in enumerate(lcols):
                            y_vals = df_chart[col].replace(0.0, np.nan)
                            plt.plot(x_vals, y_vals, label=str(col).replace('_m','').title(), color=colors_lc[idx % 3], linewidth=0.8, alpha=0.8)

                        # Threshold lines (from default _thresholds in sensors: UML=0.15, PML=0.4 -- but standard is 1.0, 0.8... let's use 0.4 and 0.15)
                        plt.axhline(y=0.4, color='gold', linestyle='--', linewidth=0.8, label='PML Threshold')
                        plt.axhline(y=0.15, color='red', linestyle='--', linewidth=0.8, label='UML Threshold')

                        plt.title("Clearance vs Chainage", fontsize=10, fontweight='bold')
                        plt.xlabel("Chainage (m)", fontsize=9)
                        plt.ylabel("Clearance (m)", fontsize=9)
                        # Auto scale X
                        plt.xlim([float(x_vals.min()), float(x_vals.max())])
                        
                        plt.grid(True, linestyle='--', alpha=0.5)
                        plt.legend(fontsize=8, loc='upper right')
                        plt.tight_layout()
                        plt.savefig(chart_inf_path, dpi=120)
                        plt.close()

                        elements.append(Image(chart_inf_path, width=500, height=220))
                        elements.append(Spacer(1, 15))
                    else:
                        elements.append(Paragraph("Not enough chainage variation to plot clearance.", normal_style))
                else:
                    elements.append(Paragraph("Missing chainage or lidar columns for chart.", normal_style))
            except Exception as e:
                logger.error(f"Error plotting clearance: {e}")
                elements.append(Paragraph("Failed to generate clearance chart.", normal_style))
        else:
            elements.append(Paragraph("No infringement data available for chart.", normal_style))
            elements.append(Spacer(1, 15))


        elements.append(Paragraph("Vehicle Acceleration Profile", h2_style))
        if df_acc is not None and not df_acc.empty:
            try:
                # Find columns
                ax_c = next((c for c in df_acc.columns if c.lower() in ['acc x', 'accx', 'ax']), None)
                ay_c = next((c for c in df_acc.columns if c.lower() in ['acc y', 'accy', 'ay']), None)
                az_c = next((c for c in df_acc.columns if c.lower() in ['acc z', 'accz', 'az']), None)
                chain_c = next((c for c in df_acc.columns if 'chainage' in c.lower() or c.lower() == 'y'), None)

                if chain_c and any([ax_c, ay_c, az_c]):
                    df_chart = df_acc.dropna(subset=[chain_c]).copy()
                    
                    # Downsample if dense
                    if len(df_chart) > 3000:
                        df_chart = df_chart.iloc[::(len(df_chart)//1500)]

                    x_vals = df_chart[chain_c]

                    if x_vals.nunique() > 1:
                        chart_acc_path = os.path.join(folder_path, "report_accel_chart.png")
                        plt.figure(figsize=(8, 3.5))
                        
                        if ax_c: plt.plot(x_vals, df_chart[ax_c], label="Acc X", color='tomato', linewidth=0.6, alpha=0.7)
                        if ay_c: plt.plot(x_vals, df_chart[ay_c], label="Acc Y", color='mediumseagreen', linewidth=0.6, alpha=0.7)
                        if az_c: plt.plot(x_vals, df_chart[az_c], label="Acc Z", color='royalblue', linewidth=0.6, alpha=0.7)

                        plt.title("Acceleration vs Chainage", fontsize=10, fontweight='bold')
                        plt.xlabel("Chainage (m)", fontsize=9)
                        plt.ylabel("Acceleration (m/s²)", fontsize=9)
                        
                        plt.xlim([float(x_vals.min()), float(x_vals.max())])
                        # Auto scale Y to data
                        y_vals = []
                        if ax_c: y_vals.extend(df_chart[ax_c].dropna().tolist())
                        if ay_c: y_vals.extend(df_chart[ay_c].dropna().tolist())
                        if az_c: y_vals.extend(df_chart[az_c].dropna().tolist())
                        if y_vals:
                            ymin, ymax = min(y_vals), max(y_vals)
                            padding = (ymax - ymin) * 0.1
                            plt.ylim([ymin - padding, ymax + padding])

                        plt.grid(True, linestyle='--', alpha=0.5)
                        plt.legend(fontsize=8, loc='upper right')
                        plt.tight_layout()
                        plt.savefig(chart_acc_path, dpi=120)
                        plt.close()

                        elements.append(Image(chart_acc_path, width=500, height=220))
                    else:
                        elements.append(Paragraph("Not enough chainage variation to plot acceleration.", normal_style))
                else:
                    elements.append(Paragraph("Missing chainage or acceleration columns for chart.", normal_style))
            except Exception as e:
                logger.error(f"Error plotting acceleration: {e}")
                elements.append(Paragraph("Failed to generate acceleration chart.", normal_style))
        else:
            elements.append(Paragraph("No acceleration data available for chart.", normal_style))

        # ==========================================
        # PAGE 4: Key Evidence Images (Top 5)
        # ==========================================
        print("Starting Page 4 (Images)...")
        snap_dir = os.path.join(folder_path, "defect_snapshots")
        if os.path.isdir(snap_dir):
            snaps = sorted(glob.glob(os.path.join(snap_dir, "*.jpg")))
            print(f"Found {len(snaps)} snapshots in {snap_dir}")
            if snaps:
                elements.append(PageBreak())
                elements.append(Paragraph("Key Evidence Snapshots", h2_style))
                elements.append(Spacer(1, 10))
                
                # Take up to 5
                for snap_path in snaps[:5]:
                    snap_name = os.path.basename(snap_path)
                    try:
                        elements.append(Image(snap_path, width=320, height=200))
                        elements.append(Paragraph(f"<i>{snap_name}</i>", normal_style))
                        elements.append(Spacer(1, 15))
                    except Exception as e:
                        print(f"Error adding image {snap_name}: {e}")
                        pass
        else:
            print("No snapshot directory found.")

        # Build PDF
        print("Building final PDF document...")
        doc.build(elements)
        print("PDF Build SUCCESS!")
        logger.info(f"Report generated: {report_path}")
        return report_path


# Global singleton
report_gen = ReportGenerator()
