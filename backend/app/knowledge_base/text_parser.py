"""
文本解析与分块工具
支持 PDF / TXT / MD
"""
import re


def load_text(file_path: str) -> str:
    """根据文件扩展名解析文档，返回纯文本。"""
    if file_path.lower().endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)

    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


def split_text(text: str, chunk_size: int = 800, chunk_overlap: int = 100) -> list[str]:
    """将文本按指定参数切分为块（纯 Python 实现，无需 langchain）。"""
    separators = ["\n\n", "\n", "。", "！", "？", ".", " ", ""]
    
    # 先尝试按段落/句子分割
    chunks = []
    current_chunk = ""
    
    # 按自然分隔符分割文本
    parts = [text]
    for sep in separators[:-1]:
        new_parts = []
        for part in parts:
            if len(part) <= chunk_size:
                new_parts.append(part)
            else:
                split_parts = part.split(sep)
                for i, sp in enumerate(split_parts):
                    if i < len(split_parts) - 1:
                        new_parts.append(sp + sep)
                    else:
                        new_parts.append(sp)
        parts = [p for p in new_parts if p]
    
    # 合并成指定大小的块
    for part in parts:
        if len(current_chunk) + len(part) <= chunk_size:
            current_chunk += part
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = part
            # 如果单个部分超过 chunk_size，强制分割
            while len(current_chunk) > chunk_size:
                chunks.append(current_chunk[:chunk_size])
                current_chunk = current_chunk[chunk_size - chunk_overlap:]
    
    if current_chunk:
        chunks.append(current_chunk)
    
    return chunks


def parse_and_split(file_path: str, chunk_size: int = 800, chunk_overlap: int = 100) -> list[dict]:
    """
    解析文档并分块，返回分块列表。
    每个块包含 chunk_index、content、chars 三个字段。
    """
    text = load_text(file_path)
    chunks = split_text(text, chunk_size, chunk_overlap)
    return [
        {"chunk_index": idx, "content": chunk, "chars": len(chunk)}
        for idx, chunk in enumerate(chunks)
    ]
