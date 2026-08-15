# 0010: World Navigation Mesh (experimental)

Status: **exploratory**. Not normative, no conformance claim. Proposal numbering
does not imply acceptance or stability.

This proposal records the first implementation-backed contract for declaring
walkable world geometry in a `.wsp` manifest. It extends the existing
`navigation` declaration; it does not replace logical zones and edges.

## 1. Creator and visitor problem

A world can render walls, gaps, and platforms but the package envelope has no
portable way to tell a Browser where a visitor may physically walk. Putting
collision policy only in world script makes desktop, third-person, and XR
locomotion inconsistent and lets room-scale XR movement bypass joystick-only
checks.

The nav mesh gives the Browser a small, declarative walkable surface. It does
not expose visitor data, grant a capability, execute code, or permit network
access. Untrusted geometry is bounded and validated before use.

## 2. Manifest shape

The experimental-v0 world schema accepts:

```json
{
  "navigation": {
    "navMesh": {
      "vertices": [
        [-5, 0, -5],
        [5, 0, -5],
        [5, 0, 5],
        [-5, 0, 5]
      ],
      "polygons": [[0, 1, 2, 3]]
    }
  }
}
```

`vertices` contains world-space `[x, y, z]` coordinates in metres. `polygons`
contains arrays of zero-based indices into `vertices`. Each polygon describes a
closed walkable region; the closing index is implicit and MUST NOT be repeated.

This contract is versioned by the enclosing experimental-v0 package profile.
An incompatible geometry contract requires a new profile or a separately
versioned member; the fields above must not silently change meaning.

## 3. Geometry requirements

The v0 traversal model is deliberately two-dimensional:

- Browsers project vertices and visitor movement onto the world X/Z plane.
  Vertex Y remains available for visualization but does not define slopes,
  stairs, stacked floors, falling, or vertical clearance.
- A polygon has 3 to 64 distinct indices and is simple, non-self-intersecting,
  non-degenerate, and strictly convex after X/Z projection. Either winding is
  accepted, but winding must be consistent within the polygon.
- A mesh contains 3 to 65,535 vertices and 1 to 65,535 polygons. Every index
  must reference a declared vertex and every coordinate must be a finite JSON
  number.
- An undirected polygon edge used exactly once is a traversal boundary. An edge
  used by two polygons joins their walkable regions. More than two uses is
  non-manifold and invalid.
- The union of polygon interiors and shared edges is walkable. Everything else
  is unwalkable. Holes are represented by the absence of polygons, not by
  winding conventions.

A Browser MUST reject an invalid declared nav mesh rather than partially use
it. Worlds without `navigation.navMesh` retain implementation-defined movement
behavior, preserving older manifests.

## 4. Visitor volume and locomotion

The Browser, not the world, owns the visitor collision volume and accessibility
adjustments. A Browser SHOULD model horizontal clearance as a circle (the X/Z
footprint of a vertical capsule) and keep the circle inside the walkable union.
Capsule height is relevant to visualization and future vertical navigation but
does not affect v0 flat traversal.

The constraint applies to the visitor's locomotion authority, not a camera.
This distinction is required for third-person views. In immersive XR, physical
headset movement relative to the XR origin must be incorporated into visitor
movement so room-scale motion cannot enter unwalkable space; correcting the
visitor must not create a feedback loop that repeatedly reapplies the same XR
offset.

For each continuous movement, a Browser:

1. sweeps the visitor footprint from its previous accepted position to the
   requested position, so a large step cannot tunnel across a boundary;
2. stops at the first blocking boundary and retains the component of remaining
   movement tangent to that boundary, allowing wall sliding;
3. evaluates simultaneous contacts without edge-order bias; at a convex corner,
   a small directional bias may route movement around the corresponding rounded
   endpoint, while a movement truly into both blocking normals may stop;
4. never resolves penetration by placing the visitor across the blocking
   boundary.

If an external transform, spawn, tracking update, or numerical error starts the
visitor outside the valid inset region, recovery chooses the closest valid
point reachable on the same side of the first relevant boundary when that side
can be determined. Recovery MUST NOT turn clipping into passage through a wall.

These are outcome requirements. Implementations may use a capsule sweep,
configuration-space inset, continuous collision detection, or an equivalent
solver.

## 5. Developer visualization

Browsers should offer developer-only visualization of nav-mesh polygons,
boundaries, contacts, and the visitor collision capsule. Its control mechanism
is Browser tooling and is intentionally absent from the manifest contract.
Worlds must not depend on debug rendering being available or enabled.

## 6. Failure, limits, and forward compatibility

Parsing and validation must be bounded before navigation begins. A malformed or
unsupported nav mesh fails the world manifest closed under the experimental-v0
schema; a Browser must not guess at repaired indices, polygon order, topology,
or coordinate space.

This version does not define concave polygons, slope limits, multiple stacked
surfaces, off-mesh links, teleport arcs, dynamic obstacles, area costs, agent
classes, or external nav-mesh resources. Those require explicit future
contracts. Large meshes may later move to integrity-addressed package resources
without changing the meaning of this inline form.

## 7. Implementation and acceptance evidence

The initial Webspace Browser implementation demonstrates an inline mesh,
Browser-owned capsule, swept containment, wall sliding, symmetric corner
handling, same-side recovery, third-person player authority, and XR room-scale
constraint. Cross-browser advancement should additionally demonstrate:

- valid and malformed manifest fixtures;
- desktop, third-person, and room-scale XR movement against the same mesh;
- no tunnelling under a movement step larger than the visitor radius;
- wall sliding in both directions and unbiased corner behavior;
- recovery that cannot cross a boundary; and
- unchanged behavior for worlds that omit the member.
