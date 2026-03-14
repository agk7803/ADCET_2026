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
from typing import Optional, List, Any

# Shared session context so we don't assume finding the newest folder by mtime
# but instead use the explicitly provided get_report_dir() if passed.
try:
    from backend.services.report_session import get_report_dir
except ImportError:
    get_report_dir = None

from backend.services.ai_service import ai_service

logger = logging.getLogger("itms.report_service")

class ReportGenerator:
    """Compact PDF report generator using pandas, exactly structured for specific charts."""

    def generate_folder_report(self, folder_path: Optional[str] = None) -> str:
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
        df_defects: Optional[pd.DataFrame] = None
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
        elements.append(Spacer(1, 20))

        # ==========================================
        # AI MAINTENANCE SUGGESTIONS (Integrated in Page 1)
        # ==========================================
        print("Gathering data for AI Suggestions...")
        session_data = {
            "total_defects": int(total_defects),
            "min_clearance": str(min_clearance),
            "max_acceleration": str(max_acc),
            "clearance_classes": {k: int(v) for k, v in class_counts.items()}
        }
        
        print("Calling Gemini for maintenance suggestions...")
        ai_suggestions = ai_service.generate_industrial_report(session_data)
        
        elements.append(Paragraph("AI Maintenance Suggestions", h2_style))
        # Style for suggestions box
        sugg_style = ParagraphStyle('Suggestion', parent=normal_style, leftIndent=10, bulletIndent=0)
        for line in ai_suggestions.split('\n'):
            line = line.strip()
            if not line: continue
            # Handle bullet points
            cleaned_line = line.lstrip('-').lstrip('*').strip()
            elements.append(Paragraph(f"• {cleaned_line}", sugg_style))
            elements.append(Spacer(1, 4))

        elements.append(PageBreak())
        print("Completed Page 1 (Session Summary + AI Suggestions).")

        # ==========================================
        # PAGE 2: Defect Summary (Top 10)
        # ==========================================
        print("Starting Page 2 (Defect Summary)...")
        elements.append(Paragraph("Detailed Defect Detections", h2_style))
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

            t_def = Table(defect_table_data, colWidths=[120, 80, 130, 80])
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

        # ==========================================
        # CRITICAL INFRINGEMENTS (UML/PML List)
        # ==========================================
        if df_inf is not None and not df_inf.empty:
            elements.append(Spacer(1, 20))
            elements.append(Paragraph("Critical Clearances (UML & PML)", h2_style))
            
            inf_list_data = [["Chainage (m)", "Lidar Source", "Clearance (m)", "Category"]]
            
            # Find relevant columns
            chain_c = next((c for c in df_inf.columns if c.lower() == 'y' or 'chain' in c.lower()), None)
            lcols = [c for c in ['lidar1_m', 'lidar2_m', 'lidar3_m'] if c in df_inf.columns]
            class_cols = [c for c in ['class_1', 'class_2', 'class_3'] if c in df_inf.columns]

            if chain_c and lcols:
                critical_points = []
                for idx, row in df_inf.iterrows():
                    for i, lcol in enumerate(lcols):
                        cls_col = f"class_{i+1}"
                        if cls_col in df_inf.columns:
                            cat = str(row[cls_col])
                            if cat in ["UML", "PML"]:
                                critical_points.append({
                                    "chainage": row[chain_c],
                                    "source": lcol.replace('_m', '').upper(),
                                    "val": row[lcol],
                                    "cat": cat
                                })
                
                # Sort by severity then sub-sort by chainage
                critical_points.sort(key=lambda x: (0 if x['cat'] == 'UML' else 1, x['chainage']))
                
                # Take top 10 most critical or representative
                for p in critical_points[:15]:
                    inf_list_data.append([
                        f"{float(p['chainage']):.2f}",
                        p['source'],
                        f"{float(p['val']):.3f}",
                        p['cat']
                    ])
                
                if len(inf_list_data) > 1:
                    t_inf = Table(inf_list_data, colWidths=[100, 100, 100, 110])
                    t_inf.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#d35400')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                        ('PADDING', (0, 0), (-1, -1), 6),
                        ('FONTSIZE', (0, 0), (-1, -1), 10),
                        # Conditional coloring for UML rows
                        # (Note: ReportLab doesn't support easy conditional row coloring in a single call,
                        #  but we can iterate and set BACKGROUND for specific cells if needed)
                    ]))
                    # Color UML rows red
                    for i in range(1, len(inf_list_data)):
                        if inf_list_data[i][3] == "UML":
                            t_inf.setStyle(TableStyle([('BACKGROUND', (3, i), (3, i), colors.red)]))
                        else:
                            t_inf.setStyle(TableStyle([('BACKGROUND', (3, i), (3, i), colors.orange)]))

                    elements.append(t_inf)
                else:
                    elements.append(Paragraph("No UML or PML infringements detected.", normal_style))

        elements.append(PageBreak())

        # ==========================================
        # PAGE 3: Clearance and Vibration Charts
        # ==========================================
        elements.append(Paragraph("Structure Clearance Profile", h2_style))
        if df_inf is not None and not df_inf.empty:
            try:
                # Need to plot vs chainage
                chain_c = next((c for c in df_inf.columns if c.lower() == 'y' or 'chain' in c.lower()), None)
                lcols = [c for c in ['lidar1_m', 'lidar2_m', 'lidar3_m'] if c in df_inf.columns]
                
                if chain_c and len(lcols) > 0:
                    df_chart = df_inf.dropna(subset=[chain_c]).copy()
                    if len(df_chart) > 2000:
                        df_chart = df_chart.iloc[::(len(df_chart)//1000)]
                    
                    x_vals = df_chart[chain_c]
                    
                    if x_vals.nunique() > 1:
                        chart_inf_path = os.path.join(folder_path, "report_clearance_chart.png")
                        plt.figure(figsize=(8, 3.5))
                        
                        colors_lc = ['orange', 'royalblue', 'green']
                        for idx, col in enumerate(lcols):
                            y_vals = df_chart[col].replace(0.0, np.nan)
                            plt.plot(x_vals, y_vals, label=str(col).replace('_m','').title(), color=colors_lc[idx % 3], linewidth=0.8, alpha=0.8)

                        plt.axhline(y=0.4, color='gold', linestyle='--', linewidth=0.8, label='PML (0.4m)')
                        plt.axhline(y=0.15, color='red', linestyle='--', linewidth=0.8, label='UML (0.15m)')

                        plt.title("Clearance vs Chainage", fontsize=10, fontweight='bold')
                        plt.xlabel("Chainage (m)", fontsize=9)
                        plt.ylabel("Clearance (m)", fontsize=9)
                        plt.xlim([float(x_vals.min()), float(x_vals.max())])
                        plt.grid(True, linestyle='--', alpha=0.5)
                        plt.legend(fontsize=8, loc='upper right')
                        plt.tight_layout()
                        plt.savefig(chart_inf_path, dpi=120)
                        plt.close()

                        elements.append(Image(chart_inf_path, width=500, height=220))
                        elements.append(Spacer(1, 15))
                else:
                    elements.append(Paragraph("Missing data for clearance plot.", normal_style))
            except Exception as e:
                logger.error(f"Error plotting clearance: {e}")

        elements.append(Paragraph("Vehicle Acceleration Profile", h2_style))
        if df_acc is not None and not df_acc.empty:
            try:
                ax_c = next((c for c in df_acc.columns if c.lower() in ['acc x', 'accx', 'ax']), None)
                ay_c = next((c for c in df_acc.columns if c.lower() in ['acc y', 'accy', 'ay']), None)
                az_c = next((c for c in df_acc.columns if c.lower() in ['acc z', 'accz', 'az']), None)
                chain_c = next((c for c in df_acc.columns if 'chainage' in c.lower() or c.lower() == 'y'), None)

                if chain_c and any([ax_c, ay_c, az_c]):
                    df_chart = df_acc.dropna(subset=[chain_c]).copy()
                    if len(df_chart) > 3000:
                        df_chart = df_chart.iloc[::(len(df_chart)//1500)]

                    x_vals = df_chart[chain_c]
                    if x_vals.nunique() > 1:
                        chart_acc_path = os.path.join(folder_path, "report_accel_chart.png")
                        plt.figure(figsize=(8, 3.5))
                        
                        if ax_c: plt.plot(x_vals, df_chart[ax_c], label="X-Axis", color='tomato', linewidth=0.6, alpha=0.7)
                        if ay_c: plt.plot(x_vals, df_chart[ay_c], label="Y-Axis", color='mediumseagreen', linewidth=0.6, alpha=0.7)
                        if az_c: plt.plot(x_vals, df_chart[az_c], label="Z-Axis", color='royalblue', linewidth=0.6, alpha=0.7)

                        plt.title("Vibration Multi-Axis Profile", fontsize=10, fontweight='bold')
                        plt.xlabel("Chainage (m)", fontsize=9)
                        plt.ylabel("Acc (m/s²)", fontsize=9)
                        plt.xlim([float(x_vals.min()), float(x_vals.max())])
                        plt.grid(True, linestyle='--', alpha=0.5)
                        plt.legend(fontsize=8, loc='upper right')
                        plt.tight_layout()
                        plt.savefig(chart_acc_path, dpi=120)
                        plt.close()
                        elements.append(Image(chart_acc_path, width=500, height=220))
            except Exception as e:
                logger.error(f"Error plotting acceleration: {e}")

        # ==========================================
        # PAGE 4: Key Evidence Images (Top 5)
        # ==========================================
        print("Starting Page 4 (Images)...")
        snap_dir = os.path.join(folder_path, "defect_snapshots")
        if os.path.isdir(snap_dir):
            snaps = sorted(glob.glob(os.path.join(snap_dir, "*.jpg")))
            if snaps:
                elements.append(PageBreak())
                elements.append(Paragraph("Maintenance Evidence Log", h2_style))
                elements.append(Spacer(1, 10))
                
                # Take up to 5
                for snap_path in snaps[:5]:
                    snap_name = os.path.basename(snap_path)
                    
                    # Try to extract chainage/time from filename or related data
                    # (Standard naming ITMS often uses: timestamp_chainage_class.jpg)
                    metadata_text = snap_name
                    parts = snap_name.split('_')
                    if len(parts) >= 2:
                        # Dummy heuristic: [Time | Chainage: XX m]
                        metadata_text = f"Time: {parts[0]} | Chainage: {parts[1]}m"

                    try:
                        elements.append(Image(snap_path, width=380, height=220))
                        elements.append(Paragraph(f"<b>Capture:</b> {metadata_text}", normal_style))
                        elements.append(Spacer(1, 20))
                    except Exception as e:
                        print(f"Error adding image {snap_name}: {e}")
        
        # Build PDF
        print("Building final PDF document...")
        doc.build(elements)
        print("PDF Build SUCCESS!")
        logger.info(f"Report generated: {report_path}")
        return report_path


# Global singleton
report_gen = ReportGenerator()
