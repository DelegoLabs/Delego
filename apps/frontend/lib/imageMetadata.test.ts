import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stripImageMetadata, stripMultipleImagesMetadata, revokePreviewUrls } from "./imageMetadata";

// Mock canvas and Image for testing
beforeEach(() => {
  global.Image = class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = "";
    width = 800;
    height = 600;

    constructor() {
      // Simulate async image load
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    }
  } as any;

  global.FileReader = class MockFileReader {
    onload: ((event: any) => void) | null = null;
    onerror: (() => void) | null = null;
    result: string | null = null;

    readAsDataURL() {
      setTimeout(() => {
        this.result = "data:image/jpeg;base64,mockdata";
        if (this.onload) {
          this.onload({ target: { result: this.result } });
        }
      }, 0);
    }
  } as any;

  // Mock canvas
  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      drawImage: vi.fn(),
    })),
    toBlob: vi.fn((callback: (blob: Blob | null) => void, type: string, quality: number) => {
      const mockBlob = new Blob(["mock image data"], { type });
      callback(mockBlob);
    }),
  };

  global.document.createElement = vi.fn((tagName: string) => {
    if (tagName === "canvas") return mockCanvas as any;
    return {} as any;
  });

  // Mock URL.createObjectURL and revokeObjectURL
  global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("stripImageMetadata", () => {
  it("should strip EXIF metadata from an image file", async () => {
    const mockFile = new File(["mock content"], "test-image.jpg", {
      type: "image/jpeg",
    });

    const result = await stripImageMetadata(mockFile);

    expect(result.originalName).toBe("test-image.jpg");
    expect(result.previewUrl).toBe("blob:mock-url");
    expect(result.file).toBeInstanceOf(File);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("should reject non-image files", async () => {
    const mockFile = new File(["mock content"], "test.txt", {
      type: "text/plain",
    });

    await expect(stripImageMetadata(mockFile)).rejects.toThrow("File must be an image");
  });
});

describe("stripMultipleImagesMetadata", () => {
  it("should process multiple image files", async () => {
    const mockFiles = [
      new File(["mock1"], "image1.jpg", { type: "image/jpeg" }),
      new File(["mock2"], "image2.png", { type: "image/png" }),
    ];

    const results = await stripMultipleImagesMetadata(mockFiles);

    expect(results).toHaveLength(2);
    expect(results[0].originalName).toBe("image1.jpg");
    expect(results[1].originalName).toBe("image2.png");
  });
});

describe("revokePreviewUrls", () => {
  it("should revoke all preview URLs", () => {
    const mockCleanedFiles = [
      {
        file: new File([], "test1.jpg"),
        previewUrl: "blob:url1",
        originalName: "test1.jpg",
        sizeBytes: 1000,
      },
      {
        file: new File([], "test2.jpg"),
        previewUrl: "blob:url2",
        originalName: "test2.jpg",
        sizeBytes: 2000,
      },
    ];

    revokePreviewUrls(mockCleanedFiles);

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:url1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:url2");
  });
});
